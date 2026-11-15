from __future__ import annotations

from pathlib import Path
import shutil
import tempfile
import unittest

from astropy.io import fits
from astropy.wcs import WCS
import numpy as np

from app.schemas.observations import ObservationRecord
from app.services.temporal_sequence_service import (
    SequenceLimitExceeded,
    SpherexTemporalSequenceService,
)


TARGET_RA = 10.0
TARGET_DEC = -5.0
LARGE_FOOTPRINT = "POLYGON ICRS 9 -6 11 -6 11 -4 9 -4 9 -6"
SMALL_FOOTPRINT = "POLYGON ICRS 9.9 -5.1 10.1 -5.1 10.1 -4.9 9.9 -4.9 9.9 -5.1"


class FakeIrsaClient:
    def __init__(self, observations: list[ObservationRecord], source: Path) -> None:
        self.observations = observations
        self.source = source
        self.search_calls = 0
        self.download_calls = 0

    def search(self, query: object) -> list[ObservationRecord]:
        self.search_calls += 1
        return list(self.observations)

    def download(
        self,
        observation: ObservationRecord,
        output_directory: Path,
        **_: object,
    ) -> Path:
        self.download_calls += 1
        output_directory.mkdir(parents=True, exist_ok=True)
        destination = output_directory / f"{observation.observation_id}.fits"
        shutil.copyfile(self.source, destination)
        return destination


def observation(
    observation_id: str,
    observed_at: str,
    *,
    bandpass: str = "SPHEREx-D3",
    spatial_region: str = LARGE_FOOTPRINT,
) -> ObservationRecord:
    return ObservationRecord(
        observation_id=observation_id,
        collection="spherex_dr1",
        access_url=f"https://irsa.ipac.caltech.edu/{observation_id}.fits",
        access_format="image/fits",
        estimated_size_kb=1,
        ra_deg=TARGET_RA,
        dec_deg=TARGET_DEC,
        observed_at=observed_at,
        observation_end=observed_at,
        bandpass=bandpass,
        instrument="SPHEREx",
        spatial_resolution_arcsec=3.075,
        spatial_region=spatial_region,
    )


class TemporalSequenceServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.source = self.root / "source.fits"
        primary = fits.PrimaryHDU()
        source_wcs = WCS(naxis=2)
        source_wcs.wcs.ctype = ["RA---TAN", "DEC--TAN"]
        source_wcs.wcs.cunit = ["deg", "deg"]
        source_wcs.wcs.crval = [TARGET_RA, TARGET_DEC]
        source_wcs.wcs.crpix = [6, 6]
        source_wcs.wcs.cdelt = [-0.05, 0.05]
        image = fits.ImageHDU(
            data=np.arange(121, dtype=np.float32).reshape(11, 11),
            header=source_wcs.to_header(),
            name="IMAGE",
        )
        image.header["BUNIT"] = "MJy / sr"
        fits.HDUList([primary, image]).writeto(self.source)

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def test_creates_sorted_sequence_and_filters_band_and_footprint(self) -> None:
        client = FakeIrsaClient(
            [
                observation("later", "2025-01-01T00:02:00"),
                observation("wrong-band", "2025-01-01T00:01:00", bandpass="SPHEREx-D4"),
                observation("small", "2025-01-01T00:01:30", spatial_region=SMALL_FOOTPRINT),
                observation("earlier", "2025-01-01T00:00:00"),
            ],
            self.source,
        )
        service = SpherexTemporalSequenceService(client, download_workers=2)

        result = service.create_sequence(
            ra_deg=TARGET_RA,
            dec_deg=TARGET_DEC,
            output_directory=self.root / "output",
        )

        self.assertEqual(client.search_calls, 1)
        self.assertEqual(client.download_calls, 2)
        self.assertEqual(result.frame_count, 2)
        self.assertTrue(result.aligned)
        self.assertEqual(
            [frame.observation.observation_id for frame in result.frames],
            ["earlier", "later"],
        )
        self.assertEqual(result.frames[1].gap_from_previous_seconds, 120.0)
        self.assertTrue(Path(result.manifest_path).exists())
        self.assertTrue(all(Path(frame.frame.path).exists() for frame in result.frames))

    def test_stops_before_download_when_limit_is_exceeded(self) -> None:
        client = FakeIrsaClient(
            [
                observation("one", "2025-01-01T00:00:00"),
                observation("two", "2025-01-01T00:02:00"),
            ],
            self.source,
        )
        service = SpherexTemporalSequenceService(client, max_frames=1)

        with self.assertRaises(SequenceLimitExceeded):
            service.create_sequence(
                ra_deg=TARGET_RA,
                dec_deg=TARGET_DEC,
                output_directory=self.root / "output",
            )

        self.assertEqual(client.download_calls, 0)

    def test_lazy_dataset_reuses_metadata_and_materializes_only_requested_frame(self) -> None:
        client = FakeIrsaClient(
            [
                observation("one", "2025-01-01T00:00:00"),
                observation("two", "2025-01-01T00:02:00"),
                observation("three", "2025-01-01T00:04:00"),
                observation("four", "2025-01-01T00:06:00"),
                observation("later", "2025-02-01T00:00:00"),
            ],
            self.source,
        )
        service = SpherexTemporalSequenceService(client)
        cache = self.root / "cache"

        dataset = service.discover_dataset(
            ra_deg=TARGET_RA,
            dec_deg=TARGET_DEC,
            output_directory=cache,
        )
        cached_dataset = service.discover_dataset(
            ra_deg=TARGET_RA,
            dec_deg=TARGET_DEC,
            output_directory=cache,
        )

        self.assertFalse(dataset.cache_hit)
        self.assertTrue(cached_dataset.cache_hit)
        self.assertEqual(client.search_calls, 1)
        self.assertEqual(service.select_indices(dataset, "fast"), [0, 1, 2, 3])
        self.assertEqual(service.select_indices(dataset, "full"), [0, 1, 2, 3, 4])

        frame = service.materialize_frame(
            dataset=dataset,
            observation_index=0,
            output_directory=cache,
        )
        cached_frame = service.materialize_frame(
            dataset=dataset,
            observation_index=0,
            output_directory=cache,
        )

        self.assertFalse(frame.cache_hit)
        self.assertTrue(frame.frame.aligned)
        self.assertEqual(frame.frame.center_ra_deg, TARGET_RA)
        self.assertEqual(frame.frame.center_dec_deg, TARGET_DEC)
        self.assertTrue(cached_frame.cache_hit)
        self.assertEqual(client.download_calls, 1)
        self.assertEqual(service.clear_cache(cache, dataset.request_id), 1)
        self.assertFalse(Path(dataset.dataset_path).exists())

    def test_prefetch_materializes_first_frame_then_entire_selected_sequence(self) -> None:
        client = FakeIrsaClient(
            [
                observation("one", "2025-01-01T00:00:00"),
                observation("two", "2025-01-01T00:02:00"),
                observation("three", "2025-01-01T00:04:00"),
                observation("four", "2025-01-01T00:06:00"),
                observation("five", "2025-01-01T00:08:00"),
            ],
            self.source,
        )
        service = SpherexTemporalSequenceService(client, download_workers=3)
        cache = self.root / "cache"
        dataset = service.discover_dataset(
            ra_deg=TARGET_RA,
            dec_deg=TARGET_DEC,
            output_directory=cache,
        )
        progress: list[tuple[int, bool, str | None]] = []

        result = service.prefetch_frames(
            dataset=dataset,
            observation_indices=service.select_indices(dataset, "balanced"),
            output_directory=cache,
            on_progress=lambda index, frame, error: progress.append(
                (index, frame is not None, error)
            ),
        )

        self.assertEqual(result.requested_count, 5)
        self.assertEqual(result.completed_count, 5)
        self.assertEqual(result.failed_count, 0)
        self.assertEqual(progress[0], (0, True, None))
        self.assertEqual({item[0] for item in progress}, {0, 1, 2, 3, 4})
        self.assertEqual(client.download_calls, 5)
        self.assertTrue(all(Path(frame.frame.path).exists() for frame in result.frames))

        cached = service.prefetch_frames(
            dataset=dataset,
            observation_indices=range(5),
            output_directory=cache,
        )
        self.assertEqual(client.download_calls, 5)
        self.assertTrue(all(frame.cache_hit for frame in cached.frames))


if __name__ == "__main__":
    unittest.main()
