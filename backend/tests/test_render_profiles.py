from __future__ import annotations

from pathlib import Path
import shutil
import tempfile
import unittest
from unittest import mock

from astropy.io import fits
from astropy.wcs import WCS
import numpy as np
from PIL import Image

from app.schemas.observations import ObservationRecord
from app.services import temporal_sequence_service as temporal
from app.services.frame_generator import (
    RENDER_PROFILES,
    generate_frame_from_array,
    get_render_profile,
)
from app.services.temporal_sequence_service import SpherexTemporalSequenceService


def synthetic_sky(seed: int = 7) -> np.ndarray:
    """Fundo inclinado (tipo luz zodiacal) + ruído + uma estrela gaussiana."""

    rng = np.random.default_rng(seed)
    size = 96
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
    background = 50.0 + 0.4 * xx + 0.2 * yy
    star = 400.0 * np.exp(-((xx - 48) ** 2 + (yy - 48) ** 2) / (2 * 1.5**2))
    return (background + star + rng.normal(0, 2.0, (size, size))).astype(np.float32)


def render(data: np.ndarray, profile: str, directory: Path) -> tuple[np.ndarray, object]:
    path = directory / f"{profile}.png"
    frame = generate_frame_from_array(data, path, render_profile=profile, vertically_flip=False)
    with Image.open(path) as image:
        return np.asarray(image), frame


class RenderProfileTests(unittest.TestCase):
    def test_original_profile_keeps_previous_behavior(self) -> None:
        data = synthetic_sky()
        with tempfile.TemporaryDirectory() as tmp:
            pixels, frame = render(data, "original", Path(tmp))
        low, high = np.percentile(data, [1, 99])
        self.assertAlmostEqual(frame.display_min, float(low), places=3)
        self.assertAlmostEqual(frame.display_max, float(high), places=3)
        self.assertEqual(frame.stretch, "asinh(a=0.1)")
        self.assertEqual(frame.background_mode, "none")
        self.assertEqual(frame.render_profile, "original")
        # Sem remoção de fundo, o céu vazio vira um cinza médio/claro.
        self.assertGreater(np.median(pixels), 100)

    def test_clean_profile_removes_gradient_and_keeps_the_star(self) -> None:
        data = synthetic_sky()
        with tempfile.TemporaryDirectory() as tmp:
            original, _ = render(data, "original", Path(tmp))
            clean, frame = render(data, "limpa", Path(tmp))
        self.assertEqual(frame.background_mode, "local")
        self.assertGreater(frame.noise_sigma, 1.0)
        self.assertLess(frame.noise_sigma, 3.0)
        # Fundo escuro e uniforme: cantos opostos do gradiente ficam iguais e pretos.
        self.assertLess(np.median(clean), 15)
        self.assertLess(abs(float(clean[:10, :10].mean()) - float(clean[-10:, -10:].mean())), 10)
        self.assertGreater(original[-10:, -10:].mean() - original[:10, :10].mean(), 40)
        # A fonte continua saturada no centro.
        self.assertGreaterEqual(clean[48, 48], 250)

    def test_every_profile_renders_and_is_deterministic(self) -> None:
        data = synthetic_sky()
        with tempfile.TemporaryDirectory() as tmp:
            for name in RENDER_PROFILES:
                with self.subTest(profile=name):
                    first, frame = render(data, name, Path(tmp))
                    second, _ = render(data, name, Path(tmp))
                    self.assertTrue(np.array_equal(first, second))
                    self.assertLess(frame.display_min, frame.display_max)

    def test_shared_display_range_keeps_epochs_comparable(self) -> None:
        first = synthetic_sky(seed=1)
        brighter = first * 1.0
        brighter[48, 48] *= 2
        with tempfile.TemporaryDirectory() as tmp:
            _, reference = render(first, "limpa", Path(tmp))
            frame = generate_frame_from_array(
                brighter,
                Path(tmp) / "second.png",
                render_profile="limpa",
                display_min=reference.display_min,
                display_max=reference.display_max,
            )
        self.assertEqual(frame.display_min, reference.display_min)
        self.assertEqual(frame.display_max, reference.display_max)

    def test_smoothing_ignores_invalid_pixels(self) -> None:
        data = synthetic_sky()
        data[:, :10] = np.nan
        with tempfile.TemporaryDirectory() as tmp:
            pixels, frame = render(data, "suave", Path(tmp))
        self.assertEqual(frame.smoothing_sigma_px, 0.8)
        self.assertTrue(np.all(pixels[:, :10] == 0))

    def test_saturated_core_is_filled_but_uncovered_edges_stay_empty(self) -> None:
        data = synthetic_sky()
        data[47:50, 47:50] = np.nan  # núcleo saturado descartado pelo pipeline
        data[:, :5] = np.nan  # borda sem cobertura
        with tempfile.TemporaryDirectory() as tmp:
            original, _ = render(data, "original", Path(tmp))
            clean, _ = render(data, "limpa", Path(tmp))
        self.assertEqual(original[48, 48], 0)
        self.assertGreaterEqual(clean[48, 48], 250)
        self.assertTrue(np.all(clean[:, :5] == 0))

    def test_saturated_core_is_opaque_in_false_color(self) -> None:
        data = synthetic_sky()
        data[47:50, 47:50] = np.nan
        wavelengths = np.full(data.shape, 2.0, dtype=np.float32)
        wavelengths[47:50, 47:50] = np.nan
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "color.webp"
            generate_frame_from_array(
                data,
                path,
                render_profile="limpa",
                wavelength_um=wavelengths,
                vertically_flip=False,
            )
            with Image.open(path) as image:
                pixels = np.asarray(image.convert("RGBA"))
        self.assertEqual(pixels[48, 48, 3], round(0.82 * 255))
        self.assertGreater(int(pixels[48, 48, :3].max()), 200)

    def test_unknown_profile_is_rejected(self) -> None:
        with self.assertRaises(ValueError):
            get_render_profile("hdr")


TARGET_RA = 10.0
TARGET_DEC = -5.0


class FakeIrsaClient:
    def __init__(self, source: Path) -> None:
        self.source = source
        self.download_calls = 0

    def search(self, query: object) -> list[ObservationRecord]:
        return [
            ObservationRecord(
                observation_id="obs-1",
                collection="spherex_dr1",
                access_url="https://irsa.ipac.caltech.edu/obs-1.fits",
                access_format="image/fits",
                estimated_size_kb=1,
                ra_deg=TARGET_RA,
                dec_deg=TARGET_DEC,
                observed_at="2025-01-01T00:00:00",
                observation_end="2025-01-01T00:00:00",
                bandpass="SPHEREx-D3",
                instrument="SPHEREx",
                spatial_resolution_arcsec=6.2,
                spatial_region="POLYGON ICRS 9 -6 11 -6 11 -4 9 -4 9 -6",
            )
        ]

    def download(self, observation: ObservationRecord, output_directory: Path, **_: object) -> Path:
        self.download_calls += 1
        output_directory.mkdir(parents=True, exist_ok=True)
        destination = output_directory / f"{observation.observation_id}.fits"
        shutil.copyfile(self.source, destination)
        return destination


class RenderVariantServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.source = self.root / "source.fits"
        source_wcs = WCS(naxis=2)
        source_wcs.wcs.ctype = ["RA---TAN", "DEC--TAN"]
        source_wcs.wcs.cunit = ["deg", "deg"]
        source_wcs.wcs.crval = [TARGET_RA, TARGET_DEC]
        source_wcs.wcs.crpix = [48.5, 48.5]
        source_wcs.wcs.cdelt = [-6.15 / 3600, 6.15 / 3600]
        image = fits.ImageHDU(synthetic_sky(), header=source_wcs.to_header(), name="IMAGE")
        fits.HDUList([fits.PrimaryHDU(), image]).writeto(self.source)

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def discover(self, service: SpherexTemporalSequenceService):
        return service.discover_dataset(
            ra_deg=TARGET_RA, dec_deg=TARGET_DEC, output_directory=self.root / "cache"
        )

    def test_variants_reuse_download_and_alignment(self) -> None:
        client = FakeIrsaClient(self.source)
        service = SpherexTemporalSequenceService(client, fov_arcmin=6, cutout_fov_arcmin=9)
        dataset = self.discover(service)
        with mock.patch.object(
            temporal, "align_fits_image", wraps=temporal.align_fits_image
        ) as align:
            color = service.materialize_frame(
                dataset=dataset, observation_index=0, output_directory=self.root / "cache"
            )
            mono = service.materialize_frame(
                dataset=dataset,
                observation_index=0,
                output_directory=self.root / "cache",
                render_profile="limpa",
                color_mode="mono",
            )
            mono_again = service.materialize_frame(
                dataset=dataset,
                observation_index=0,
                output_directory=self.root / "cache",
                render_profile="limpa",
                color_mode="mono",
            )
        self.assertEqual(align.call_count, 1)
        self.assertTrue(color.frame.colorized)
        self.assertFalse(mono.frame.colorized)
        self.assertEqual(mono.frame.render_profile, "limpa")
        self.assertIn("frames/original-color/", color.relative_path)
        self.assertIn("frames/limpa-mono/", mono.relative_path)
        self.assertTrue(mono_again.cache_hit)
        with Image.open(mono.frame.path) as image:
            mono_pixels = np.asarray(image.convert("RGB"))
        with Image.open(color.frame.path) as image:
            self.assertEqual(image.mode, "RGBA")
        # WebP não tem modo de cinza: monocromático é gravado com R = G = B.
        self.assertTrue(np.array_equal(mono_pixels[..., 0], mono_pixels[..., 1]))
        self.assertTrue(np.array_equal(mono_pixels[..., 1], mono_pixels[..., 2]))

    def test_invalid_color_mode_is_rejected(self) -> None:
        service = SpherexTemporalSequenceService(
            FakeIrsaClient(self.source), fov_arcmin=6, cutout_fov_arcmin=9
        )
        dataset = self.discover(service)
        with self.assertRaises(ValueError):
            service.materialize_frame(
                dataset=dataset,
                observation_index=0,
                output_directory=self.root / "cache",
                color_mode="sepia",
            )

    def test_pixel_scale_changes_dataset_identity_only_when_not_default(self) -> None:
        client = FakeIrsaClient(self.source)
        native = self.discover(
            SpherexTemporalSequenceService(client, fov_arcmin=6, cutout_fov_arcmin=9)
        )
        fine = self.discover(
            SpherexTemporalSequenceService(
                client, fov_arcmin=6, cutout_fov_arcmin=9, pixel_scale_arcsec=3.075
            )
        )
        self.assertNotEqual(native.request_id, fine.request_id)
        self.assertEqual(fine.pixel_scale_arcsec, 3.075)
        frame = SpherexTemporalSequenceService(
            client, fov_arcmin=6, cutout_fov_arcmin=9, pixel_scale_arcsec=3.075
        ).materialize_frame(dataset=fine, observation_index=0, output_directory=self.root / "cache")
        # 6′ a 3,075″/px → ceil(117,07) = 118 → 119 (ímpar); nativo 6,15″/px → 59.
        self.assertEqual(frame.frame.width, 119)


if __name__ == "__main__":
    unittest.main()
