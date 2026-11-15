from __future__ import annotations

from pathlib import Path
import tempfile
import unittest

from astropy.coordinates import SkyCoord
from astropy.io import fits
from astropy.wcs import WCS
import numpy as np
from scipy.ndimage import map_coordinates

from app.services.image_aligner import (
    align_fits_image, build_common_sky_grid, source_wavelength_at, source_wavelength_map,
)


TARGET_RA = 133.795129167
TARGET_DEC = -7.245147222
PIXEL_SCALE_DEG = 0.01


def rotated_wcs(*, crval_ra: float, crval_dec: float, rotation_deg: float) -> WCS:
    angle = np.deg2rad(rotation_deg)
    scale = PIXEL_SCALE_DEG
    wcs = WCS(naxis=2)
    wcs.wcs.ctype = ["RA---TAN", "DEC--TAN"]
    wcs.wcs.cunit = ["deg", "deg"]
    wcs.wcs.crval = [crval_ra, crval_dec]
    wcs.wcs.crpix = [31, 31]
    wcs.wcs.cd = np.array(
        [
            [-scale * np.cos(angle), scale * np.sin(angle)],
            [scale * np.sin(angle), scale * np.cos(angle)],
        ]
    )
    return wcs


def write_star_fits(path: Path, wcs: WCS) -> None:
    target = SkyCoord(TARGET_RA, TARGET_DEC, unit="deg", frame="icrs")
    target_x, target_y = wcs.world_to_pixel(target)
    yy, xx = np.indices((61, 61), dtype=np.float32)
    data = np.exp(-((xx - target_x) ** 2 + (yy - target_y) ** 2) / (2 * 1.2**2))
    image = fits.ImageHDU(data=data.astype(np.float32), header=wcs.to_header(), name="IMAGE")
    image.header["BUNIT"] = "MJy / sr"
    fits.HDUList([fits.PrimaryHDU(), image]).writeto(path)


def centroid(data: np.ndarray) -> tuple[float, float]:
    values = np.nan_to_num(data, nan=0.0)
    threshold = np.percentile(values[values > 0], 99)
    weights = np.where(values >= threshold, values, 0.0)
    yy, xx = np.indices(values.shape)
    return (
        float((xx * weights).sum() / weights.sum()),
        float((yy * weights).sum() / weights.sum()),
    )


class ImageAlignerTests(unittest.TestCase):
    def test_explicit_scale_builds_identical_cross_band_grid(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            first_path = root / "first.fits"
            second_path = root / "second.fits"
            write_star_fits(
                first_path,
                rotated_wcs(
                    crval_ra=TARGET_RA + 0.08,
                    crval_dec=TARGET_DEC - 0.04,
                    rotation_deg=0,
                ),
            )
            write_star_fits(
                second_path,
                rotated_wcs(
                    crval_ra=TARGET_RA - 0.06,
                    crval_dec=TARGET_DEC + 0.07,
                    rotation_deg=31,
                ),
            )

            first = build_common_sky_grid(
                first_path,
                center_ra_deg=TARGET_RA,
                center_dec_deg=TARGET_DEC,
                fov_arcmin=30,
                pixel_scale_arcsec=6.15,
            )
            second = build_common_sky_grid(
                second_path,
                center_ra_deg=TARGET_RA,
                center_dec_deg=TARGET_DEC,
                fov_arcmin=30,
                pixel_scale_arcsec=6.15,
            )

            self.assertEqual(first.shape, (293, 293))
            self.assertEqual(first.to_dict(), second.to_dict())

    def test_reprojects_shifted_rotated_frames_to_same_center(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            first_path = root / "first.fits"
            second_path = root / "second.fits"
            write_star_fits(
                first_path,
                rotated_wcs(
                    crval_ra=TARGET_RA + 0.08,
                    crval_dec=TARGET_DEC - 0.04,
                    rotation_deg=0,
                ),
            )
            write_star_fits(
                second_path,
                rotated_wcs(
                    crval_ra=TARGET_RA - 0.06,
                    crval_dec=TARGET_DEC + 0.07,
                    rotation_deg=31,
                ),
            )

            grid = build_common_sky_grid(
                first_path,
                center_ra_deg=TARGET_RA,
                center_dec_deg=TARGET_DEC,
                fov_arcmin=20,
            )
            first = align_fits_image(first_path, grid)
            second = align_fits_image(second_path, grid)
            first_center = centroid(first.data)
            second_center = centroid(second.data)
            expected = (grid.width - 1) / 2

            self.assertAlmostEqual(first_center[0], expected, delta=0.2)
            self.assertAlmostEqual(first_center[1], expected, delta=0.2)
            self.assertAlmostEqual(second_center[0], expected, delta=0.2)
            self.assertAlmostEqual(second_center[1], expected, delta=0.2)
            self.assertLess(np.hypot(*(np.subtract(first_center, second_center))), 0.2)
            self.assertIsNone(first.wavelength_um)
            self.assertIsNone(second.wavelength_um)

    def test_grid_center_remains_exact_near_celestial_pole(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "polar.fits"
            polar_wcs = rotated_wcs(
                crval_ra=12.0,
                crval_dec=89.4,
                rotation_deg=47,
            )
            write_star_fits(path, polar_wcs)
            grid = build_common_sky_grid(
                path,
                center_ra_deg=12.0,
                center_dec_deg=89.4,
                fov_arcmin=20,
            )
            center = SkyCoord(12.0, 89.4, unit="deg", frame="icrs")
            x_pixel, y_pixel = grid.wcs.world_to_pixel(center)
            expected = (grid.width - 1) / 2

            self.assertAlmostEqual(x_pixel, expected, places=7)
            self.assertAlmostEqual(y_pixel, expected, places=7)


class WavelengthSamplingTests(unittest.TestCase):
    def test_tabular_sampling_matches_full_wcs_map_with_sip_and_subpixel_positions(self) -> None:
        # Tabela não linear e não simétrica para detectar troca x/y, origem e
        # arredondamento; a WCS celeste SIP não pertence à solução espectral W.
        x, y = np.meshgrid([1, 21, 41], [1, 21, 41])
        values = np.stack((1 + x * 0.01 + y * 0.002 + x * y * 0.0001, np.full(x.shape, 0.04)), axis=-1)
        table = fits.BinTableHDU.from_columns([
            fits.Column(name="X", format="3J", array=[[1, 21, 41]]),
            fits.Column(name="Y", format="3J", array=[[1, 21, 41]]),
            fits.Column(name="VALUES", format="18E", dim="(2,3,3)", array=[values]),
        ], name="WCS-WAVE")
        image = fits.ImageHDU(np.ones((41, 41)), name="IMAGE")
        header = image.header
        header["WCSAXESW"] = 2
        for axis in (1, 2):
            for key, value in (("CTYPE", "WAVE-TAB"), ("CUNIT", "um"), ("CRPIX", 1),
                               ("CRVAL", 1), ("CDELT", 1)):
                header[f"{key}{axis}W"] = value
            header[f"PS{axis}_0W"] = "WCS-WAVE"
            header[f"PS{axis}_1W"] = "VALUES"
            header[f"PS{axis}_2W"] = "X" if axis == 1 else "Y"
            header[f"PV{axis}_3W"] = axis
        header["A_ORDER"] = 2
        header["B_ORDER"] = 2
        header["A_2_0"] = 1e-5
        header["B_0_2"] = -2e-5
        hdus = fits.HDUList([fits.PrimaryHDU(), image, table])
        # Referência independente: caminho anterior, com o cabeçalho completo
        # e remoção de SIP antes da avaliação de todos os pixels.
        reference_header = header.copy()
        for key in tuple(reference_header):
            if key.startswith(("A_", "B_", "AP_", "BP_")):
                del reference_header[key]
        yy, xx = np.indices(image.shape)
        reference = WCS(reference_header, hdus, key="W").all_pix2world(
            np.column_stack((xx.ravel(), yy.ravel())), 0
        )[:, 0].astype(np.float32).reshape(image.shape)
        np.testing.assert_array_equal(source_wavelength_map(hdus, image, image.shape), reference)
        for x, y in ((0, 0), (40, 40), (12.345, 23.456), (20, 20), (-0.2, 41.2)):
            with self.subTest(x=x, y=y):
                expected = float(map_coordinates(reference, [[y], [x]], order=1, mode="nearest")[0])
                self.assertEqual(source_wavelength_at(hdus, image, image.shape, x, y), expected)

    def test_missing_calibration_returns_no_wavelength(self) -> None:
        image = fits.ImageHDU(np.ones((41, 41)), name="IMAGE")
        hdus = fits.HDUList([fits.PrimaryHDU(), image])
        self.assertIsNone(source_wavelength_at(hdus, image, image.shape, 20.5, 20.5))
