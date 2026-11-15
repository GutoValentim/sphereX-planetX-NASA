from __future__ import annotations

from math import pi
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest import mock
import xml.etree.ElementTree as ET

from astropy.io import fits
from astropy.wcs import WCS
import numpy as np

from app.schemas.observations import ObservationRecord
from app.services import spectrum_service
from app.services.spectrum_chart import ChartSeries, render_spectrum_svg
from app.services.spectrum_service import (
    PhotometryRejected,
    SpherexSpectrumService,
    channel_medians,
    measure_spectral_point,
)


RA, DEC = 10.0, -5.0
SCALE_ARCSEC = 6.15
PIXEL_SR = (SCALE_ARCSEC / 3600 * pi / 180) ** 2
SVG = "{http://www.w3.org/2000/svg}"


def observation(identifier: str, bandpass: str = "SPHEREx-D3") -> ObservationRecord:
    return ObservationRecord(
        observation_id=identifier,
        collection="spherex_dr1",
        access_url=f"https://irsa.ipac.caltech.edu/{identifier}.fits",
        access_format="image/fits",
        estimated_size_kb=1,
        ra_deg=RA,
        dec_deg=DEC,
        observed_at="2025-05-01T00:00:00",
        observation_end=None,
        bandpass=bandpass,
        instrument="SPHEREx",
        spatial_resolution_arcsec=6.2,
        spatial_region="POLYGON ICRS 9 -6 11 -6 11 -4 9 -4 9 -6",
    )


def write_star(path: Path, *, total_mjy: float, background: float = 0.2, nan_core: bool = False) -> float:
    """Estrela gaussiana (FWHM ~1,2 px); devolve o fluxo injetado na abertura de 3 px (mJy)."""

    size = 41
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float64)
    sigma = 0.5
    peak = total_mjy / 1e9 / PIXEL_SR / (2 * pi * sigma**2)
    star = peak * np.exp(-((xx - 20) ** 2 + (yy - 20) ** 2) / (2 * sigma**2))
    image = background + star
    image += np.random.default_rng(1).normal(0, 1e-4, image.shape)
    if nan_core:
        image[20, 20] = np.nan
    wcs = WCS(naxis=2)
    wcs.wcs.ctype = ["RA---TAN", "DEC--TAN"]
    wcs.wcs.crval = [RA, DEC]
    wcs.wcs.crpix = [21, 21]
    wcs.wcs.cdelt = [-SCALE_ARCSEC / 3600, SCALE_ARCSEC / 3600]
    hdus = fits.HDUList(
        [
            fits.PrimaryHDU(),
            fits.ImageHDU(image.astype(np.float32), wcs.to_header(), name="IMAGE"),
            fits.ImageHDU(np.full(image.shape, 1e-8, np.float32), name="VARIANCE"),
        ]
    )
    hdus.writeto(path, overwrite=True)
    inside = np.hypot(xx - 20, yy - 20) <= 3.0
    return float(star[inside].sum() * PIXEL_SR * 1e9)


class PhotometryTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = Path(self.tmp.name) / "star.fits"
        patcher = mock.patch.object(spectrum_service, "_wavelength_at", return_value=2.0)
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_recovers_known_flux_after_removing_background(self) -> None:
        expected = write_star(self.path, total_mjy=1.5, background=0.3)
        point = measure_spectral_point(self.path, observation("a"), ra_deg=RA, dec_deg=DEC)
        self.assertAlmostEqual(point.flux_mjy, expected, delta=0.005)
        self.assertAlmostEqual(point.flux_mjy, 1.5, delta=0.05)  # ~1,54: amostragem discreta
        self.assertAlmostEqual(point.background_mjy_sr, 0.3, delta=1e-3)
        self.assertAlmostEqual(point.wavelength_um, 2.0)
        self.assertAlmostEqual(point.bandwidth_um, 2.0 / 41)
        self.assertGreater(point.flux_error_mjy, 0)
        self.assertIn(point.aperture_pixels, (28, 29))  # pixels exatamente no raio

    def test_saturated_core_is_rejected(self) -> None:
        write_star(self.path, total_mjy=1.5, nan_core=True)
        with self.assertRaises(PhotometryRejected):
            measure_spectral_point(self.path, observation("a"), ra_deg=RA, dec_deg=DEC)

    def test_target_near_edge_is_rejected(self) -> None:
        write_star(self.path, total_mjy=1.5)
        with self.assertRaises(PhotometryRejected):
            measure_spectral_point(self.path, observation("a"), ra_deg=RA, dec_deg=DEC + 0.03)

    def test_channel_medians_follow_wavelength_order(self) -> None:
        write_star(self.path, total_mjy=1.0)
        base = measure_spectral_point(self.path, observation("a"), ra_deg=RA, dec_deg=DEC)
        points = [
            base.__class__(**{**base.to_dict(), "wavelength_um": w, "flux_mjy": f})
            for w, f in [(1.68, 1.0), (1.69, 3.0), (1.70, 2.0), (2.3, 5.0)]
        ]
        channels = channel_medians(points, "SPHEREx-D3")
        self.assertEqual(len(channels), 2)
        self.assertAlmostEqual(channels[0][1], 2.0)
        self.assertLess(channels[0][0], channels[1][0])


class FakeIrsaClient:
    def __init__(self, directory: Path, fluxes: dict[str, float]) -> None:
        self.directory = directory
        self.fluxes = fluxes
        self.downloads = 0

    def search(self, query: object) -> list[ObservationRecord]:
        return [observation(name, band) for name, band in (
            ("d1-a", "SPHEREx-D1"), ("d1-b", "SPHEREx-D1"),
            ("d3-a", "SPHEREx-D3"), ("d3-b", "SPHEREx-D3"), ("d3-sat", "SPHEREx-D3"),
        )]

    def download(self, observation: ObservationRecord, output_directory: Path, **_: object) -> Path:
        self.downloads += 1
        output_directory.mkdir(parents=True, exist_ok=True)
        path = output_directory / f"{observation.observation_id}.fits"
        write_star(
            path,
            total_mjy=self.fluxes.get(observation.observation_id, 1.0),
            nan_core=observation.observation_id.endswith("sat"),
        )
        return path


class SpectrumServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        wavelengths = {"d1-a": 0.8, "d1-b": 1.0, "d3-a": 1.8, "d3-b": 2.2}

        def fake_wavelength(hdus, image_hdu, shape, x, y):
            name = Path(hdus.filename()).stem
            return wavelengths.get(name, 2.0)

        patcher = mock.patch.object(spectrum_service, "_wavelength_at", side_effect=fake_wavelength)
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_builds_band_and_combined_charts_with_cache(self) -> None:
        client = FakeIrsaClient(self.root / "unused", {"d1-a": 2.0, "d1-b": 2.5, "d3-a": 1.0})
        service = SpherexSpectrumService(client, download_workers=2)
        progress: list[tuple[str, int, int]] = []
        result = service.spectrum(
            ra_deg=RA,
            dec_deg=DEC,
            bandpasses=["SPHEREx-D3", "SPHEREx-D1"],
            output_directory=self.root / "cache",
            on_progress=lambda band, done, total: progress.append((band, done, total)),
        )
        d1, d3 = result.bands
        self.assertEqual([d1.bandpass, d3.bandpass], ["SPHEREx-D1", "SPHEREx-D3"])
        self.assertEqual([round(p.wavelength_um, 2) for p in d1.points], [0.8, 1.0])
        self.assertAlmostEqual(d1.points[1].flux_mjy, 2.5, delta=0.1)
        self.assertGreater(d1.points[1].flux_mjy, d1.points[0].flux_mjy)
        self.assertEqual(len(d3.points), 2)
        self.assertIn("d3-sat", d3.rejected)
        self.assertIn(("SPHEREx-D3", 3, 3), progress)
        self.assertTrue(Path(result.combined_chart).exists())
        self.assertEqual(set(result.band_charts), {"SPHEREx-D1", "SPHEREx-D3"})

        downloads = client.downloads
        again = service.spectrum(
            ra_deg=RA, dec_deg=DEC, bandpasses=["SPHEREx-D1", "SPHEREx-D3"],
            output_directory=self.root / "cache",
        )
        self.assertEqual(client.downloads, downloads)  # medições e rejeições em cache
        self.assertEqual(again.combined_chart, result.combined_chart)

        svg = ET.parse(result.combined_chart).getroot()
        texts = [node.text for node in svg.iter(f"{SVG}text")]
        self.assertIn("D1 · 0,744–1,116 µm", texts)
        self.assertIn("D3 · 1,636–2,421 µm", texts)
        colors = {node.get("stroke") for node in svg.iter(f"{SVG}polyline")}
        expected = {f"rgb({','.join(map(str, b.band['display_rgb']))})" for b in result.bands}
        self.assertEqual(colors, expected)  # mesmas cores da falsa cor das imagens


class ChartTests(unittest.TestCase):
    def test_empty_chart_explains_missing_data(self) -> None:
        svg = render_spectrum_svg([], title="Vazio")
        root = ET.fromstring(svg)
        self.assertIn("Sem medições válidas", [n.text for n in root.iter(f"{SVG}text")])

    def test_series_uses_band_color_and_decimal_comma(self) -> None:
        svg = render_spectrum_svg(
            [ChartSeries("D3 · teste", (10, 20, 30), [(1.7, 0.5, 0.1), (2.2, 0.7, None)],
                         [(1.7, 0.5), (2.2, 0.7)])],
            title="T",
            theme="light",
        )
        root = ET.fromstring(svg)
        self.assertEqual(root.find(f"{SVG}rect").get("fill"), "#ffffff")
        self.assertEqual(next(root.iter(f"{SVG}polyline")).get("stroke"), "rgb(10,20,30)")
        labels = [n.text for n in root.iter(f"{SVG}text")]
        self.assertTrue(any(label and "," in label for label in labels))

    def test_rejects_unknown_theme(self) -> None:
        with self.assertRaises(ValueError):
            render_spectrum_svg([], title="x", theme="sepia")


if __name__ == "__main__":
    unittest.main()


def write_full_cutout(path: Path, *, calibration: str = "uuid-a", detector: int = 3) -> None:
    """Cutout no formato SPHEREx: IMAGE, FLAGS, VARIANCE, EPSF grande e WCS-WAVE no fim."""

    write_star(path, total_mjy=1.0)
    with fits.open(path) as hdus:
        image = hdus["IMAGE"].copy()
        variance = hdus["VARIANCE"].copy()
    image.header["DETECTOR"] = detector
    image.header.add_history(f"[CALIB] spectral_wcs {calibration}")
    flags = fits.ImageHDU(np.zeros(image.data.shape, np.int32), name="FLAGS")
    epsf = fits.BinTableHDU.from_columns(
        [fits.Column(name="EPSF", format="1089D", array=np.zeros((40, 1089)))], name="EPSF"
    )
    table = fits.BinTableHDU.from_columns(
        [fits.Column(name="VALUES", format="4E", array=np.ones((1, 4)))], name="WCS-WAVE"
    )
    fits.HDUList([fits.PrimaryHDU(), image, flags, variance, epsf, table]).writeto(path, overwrite=True)


class StreamingResponse:
    def __init__(self, payload: bytes) -> None:
        self.payload = payload
        self.url = "https://irsa.ipac.caltech.edu/ibe/data/spherex/x.fits"
        self.sent = 0

    def raise_for_status(self) -> None:
        return None

    def iter_content(self, chunk_size: int):
        for start in range(0, len(self.payload), chunk_size):
            self.sent += 1
            yield self.payload[start : start + chunk_size]

    def __enter__(self):
        return self

    def __exit__(self, *_: object) -> None:
        return None


class PartialDownloadTests(unittest.TestCase):
    def test_stops_after_variance_and_keeps_data_identical(self) -> None:
        from app.services.irsa_client import IrsaClient

        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp) / "full.fits"
            write_full_cutout(source)
            payload = source.read_bytes()
            response = StreamingResponse(payload)
            obs = observation("x")
            obs = obs.__class__(**{**obs.__dict__, "access_url": response.url})
            with mock.patch.object(IrsaClient, "_get_with_retry", return_value=response):
                path = IrsaClient().download_hdus(
                    obs, Path(tmp) / "out", cutout_center=(RA, DEC),
                    cutout_size_deg=0.07, stop_after="VARIANCE",
                )
            with fits.open(path) as partial, fits.open(source) as full:
                self.assertEqual([h.name for h in partial], ["PRIMARY", "IMAGE", "FLAGS", "VARIANCE"])
                self.assertTrue(np.array_equal(partial["IMAGE"].data, full["IMAGE"].data))
            self.assertLess(path.stat().st_size, len(payload) / 3)
            self.assertLess(response.sent, len(payload) // (16 * 1024) + 1)


class LiteClient(FakeIrsaClient):
    """Cliente com download parcial: conta quantos downloads completos ocorreram."""

    def __init__(self, directory: Path) -> None:
        super().__init__(directory, {})
        self.full = 0
        self.lite = 0

    def download(self, observation: ObservationRecord, output_directory: Path, **_: object) -> Path:
        self.full += 1
        output_directory.mkdir(parents=True, exist_ok=True)
        path = output_directory / f"{observation.observation_id}.fits"
        write_full_cutout(path)
        return path

    def download_hdus(self, observation: ObservationRecord, output_directory: Path, **_: object) -> Path:
        self.lite += 1
        output_directory.mkdir(parents=True, exist_ok=True)
        full = output_directory / f"{observation.observation_id}-full-source.fits"
        write_full_cutout(full)
        path = output_directory / f"{observation.observation_id}-variance.fits"
        with fits.open(full) as hdus:
            fits.HDUList([h.copy() for h in hdus[:4]]).writeto(path, overwrite=True)
        full.unlink()
        return path


class CalibrationCacheTests(unittest.TestCase):
    def test_full_download_only_once_per_calibration(self) -> None:
        with tempfile.TemporaryDirectory() as tmp, mock.patch.object(
            spectrum_service, "_wavelength_at", return_value=2.0
        ):
            client = LiteClient(Path(tmp))
            service = SpherexSpectrumService(client, download_workers=1)
            result = service.band_spectrum(
                ra_deg=RA, dec_deg=DEC, bandpass="SPHEREx-D3", output_directory=Path(tmp) / "cache"
            )
            self.assertEqual(client.full, 1)  # aprende a tabela WCS-WAVE uma vez
            self.assertEqual(client.lite, 3)
            self.assertEqual(len(result.points), 3)  # recortes deste fake não têm saturação
            tables = list((Path(tmp) / "cache" / "calibration").glob("wcs-wave-d3-uuid-a.fits"))
            self.assertEqual(len(tables), 1)
            lite_files = list((Path(tmp) / "cache").glob("*/fits/*-variance.fits"))
            with_table = 0
            for path in lite_files:
                with fits.open(path) as hdus:
                    with_table += "WCS-WAVE" in hdus
            # A observação que ensinou a calibração foi medida com o arquivo completo.
            self.assertEqual(with_table, len(lite_files) - 1)


class OutlierTests(unittest.TestCase):
    def test_isolated_spike_is_flagged_and_left_out_of_channel_line(self) -> None:
        from app.services.spectrum_service import SpectralPoint, flag_outliers

        def point(index: int, wavelength: float, flux: float) -> SpectralPoint:
            return SpectralPoint(
                f"o{index}", None, "SPHEREx-D6", wavelength, 0.04, flux, 2.0, 0.1, 29, 20, 20
            )

        points = [point(i, 4.42 + i * 0.02, 100 - i + (0.5 if i % 2 else -0.5)) for i in range(25)]
        points[12] = point(12, points[12].wavelength_um, 700.0)
        outliers = flag_outliers(points)
        self.assertEqual(outliers, {"o12"})
        line = channel_medians(points, "SPHEREx-D6", exclude=outliers)
        self.assertLess(max(flux for _, flux in line), 101)
