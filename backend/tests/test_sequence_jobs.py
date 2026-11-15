from __future__ import annotations

from pathlib import Path
import tempfile
import time
import unittest

from app.schemas.observations import ObservationRecord
from app.services.frame_generator import GeneratedFrame
from app.services.sequence_jobs import SequenceJobManager
from app.services.temporal_sequence_service import LazyFrameResult, TemporalDataset


def record(identifier: str, band: str, when: str) -> ObservationRecord:
    return ObservationRecord(
        observation_id=identifier, collection="spherex_dr1",
        access_url=f"https://irsa.ipac.caltech.edu/{identifier}.fits", access_format="image/fits",
        estimated_size_kb=1, ra_deg=10, dec_deg=-5, observed_at=when, observation_end=None,
        bandpass=band, instrument="SPHEREx", spatial_resolution_arcsec=6.2,
    )


class FakeService:
    def __init__(self, band: str, times: list[str] | None, log: list[str]) -> None:
        self.band = band
        self.log = log
        self.observations = tuple(record(f"{band[-2:]}-{i}", band, t) for i, t in enumerate(times or []))
        self.available = times is not None

    def discover_dataset(self, *, ra_deg, dec_deg, output_directory):
        if not self.available:
            raise LookupError("sem cobertura")
        return TemporalDataset(
            request_id=("0" * 15 + self.band[-1]), ra_deg=ra_deg, dec_deg=dec_deg, fov_arcmin=30,
            cutout_fov_arcmin=45, bandpass=self.band, collections=("spherex_dr1",),
            source_observation_count=len(self.observations), band_observation_count=len(self.observations),
            observations=self.observations, discovered_at="x", cache_hit=False,
            dataset_path=str(output_directory / ("0" * 15 + self.band[-1]) / "dataset.json"),
        )

    def select_indices(self, dataset, mode):
        return list(range(dataset.frame_count))

    def prefetch_frames(self, *, dataset, observation_indices, output_directory, on_progress, render_profile, color_mode):
        self.log.append(self.band)
        for index in observation_indices:
            frame = GeneratedFrame(
                path="x", format="WEBP", width=293, height=293, size_bytes=1, source_hdu="IMAGE",
                source_unit=None, display_min=0, display_max=1, stretch="asinh", vertically_flipped=True,
                colorized=color_mode == "color", false_color_rgb=(0, 255, 0), render_profile=render_profile,
            )
            result = LazyFrameResult(
                dataset.request_id, index, dataset.observations[index], "f.fits",
                f"frames/{render_profile}-{color_mode}/{index:03d}.webp", frame, False,
            )
            on_progress(index, result, None)


class SequenceJobManagerTests(unittest.TestCase):
    def test_pairs_epochs_renders_anchor_first_and_publishes_urls(self) -> None:
        log: list[str] = []
        services = {
            "SPHEREx-D1": FakeService("SPHEREx-D1", ["2025-05-01T00:00:00", "2025-05-02T00:00:00"], log),
            "SPHEREx-D3": FakeService("SPHEREx-D3", ["2025-05-01T01:00:00", "2025-06-01T00:00:00"], log),
            "SPHEREx-D6": FakeService("SPHEREx-D6", None, log),
        }
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            jobs = SequenceJobManager(services.__getitem__, root, lambda p: "/f/" + p.relative_to(root).as_posix())
            job = jobs.start(
                ra_deg=10, dec_deg=-5, bandpasses=["SPHEREx-D1", "SPHEREx-D3", "SPHEREx-D6"],
                anchor_bandpass="SPHEREx-D3", mode="fast", render_profile="limpa", color_mode="mono",
            )
            for _ in range(200):
                snap = jobs.snapshot(job["job_id"])
                if snap["status"] not in {"discovering", "rendering"}:
                    break
                time.sleep(0.01)
        self.assertEqual(snap["status"], "completed", snap)
        self.assertEqual(log, ["SPHEREx-D3", "SPHEREx-D1"])  # referência primeiro
        self.assertFalse(snap["bands"]["SPHEREx-D6"]["available"])
        self.assertEqual([f["id"] for f in snap["frames"]], ["D3-0", "D3-1"])
        first = {layer["bandpass"]: layer for layer in snap["frames"][0]["layers"]}
        self.assertEqual(first["SPHEREx-D1"]["observation_id"], "D1-0")  # mais próxima no tempo
        self.assertEqual(first["SPHEREx-D1"]["delta_seconds"], -3600)
        self.assertEqual(first["SPHEREx-D3"]["image_url"], "/f/0000000000000003/frames/limpa-mono/000.webp")
        self.assertEqual(snap["progress"], {"done": 4, "total": 4})  # 2 épocas × 2 bandas

    def test_no_coverage_fails_with_message(self) -> None:
        services = {"SPHEREx-D3": FakeService("SPHEREx-D3", None, [])}
        with tempfile.TemporaryDirectory() as tmp:
            jobs = SequenceJobManager(services.__getitem__, Path(tmp), str)
            job = jobs.start(ra_deg=1, dec_deg=1, bandpasses=["SPHEREx-D3"], anchor_bandpass="SPHEREx-D3",
                             mode="fast", render_profile="limpa", color_mode="color")
            for _ in range(200):
                snap = jobs.snapshot(job["job_id"])
                if snap["status"] != "discovering":
                    break
                time.sleep(0.01)
        self.assertEqual(snap["status"], "failed")
        self.assertIn("Nenhuma banda", snap["error"])


if __name__ == "__main__":
    unittest.main()


class FlakyService(FakeService):
    """Falha uma vez na primeira observação e funciona na nova tentativa."""

    def __init__(self, *args, **kwargs) -> None:
        super().__init__(*args, **kwargs)
        self.failures_left = 1

    def prefetch_frames(self, *, dataset, observation_indices, output_directory, on_progress, render_profile, color_mode):
        if self.failures_left and 0 in observation_indices:
            self.failures_left -= 1
            on_progress(0, None, "ConnectionError: reset")
            observation_indices = [i for i in observation_indices if i != 0]
        super().prefetch_frames(
            dataset=dataset, observation_indices=observation_indices, output_directory=output_directory,
            on_progress=on_progress, render_profile=render_profile, color_mode=color_mode,
        )


class RetryTests(unittest.TestCase):
    def test_transient_layer_failure_is_retried_once(self) -> None:
        log: list[str] = []
        services = {"SPHEREx-D3": FlakyService("SPHEREx-D3", ["2025-05-01T00:00:00", "2025-05-02T00:00:00"], log)}
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            jobs = SequenceJobManager(services.__getitem__, root, lambda p: "/f/" + p.relative_to(root).as_posix())
            job = jobs.start(ra_deg=1, dec_deg=1, bandpasses=["SPHEREx-D3"], anchor_bandpass="SPHEREx-D3",
                             mode="fast", render_profile="limpa", color_mode="color")
            for _ in range(200):
                snap = jobs.snapshot(job["job_id"])
                if snap["status"] not in {"discovering", "rendering"}:
                    break
                time.sleep(0.01)
        self.assertEqual(snap["status"], "completed", snap)
        layer = snap["frames"][0]["layers"][0]
        self.assertIsNone(layer["error"])
        self.assertTrue(layer["image_url"])
        self.assertEqual(snap["progress"], {"done": 2, "total": 2})
