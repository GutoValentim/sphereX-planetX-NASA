from __future__ import annotations

from pathlib import Path
import tempfile
import unittest

import numpy as np
from PIL import Image

from app.services.frame_generator import generate_frame_from_array
from app.services.spectral_color import (
    SPHEREX_BANDS,
    SPHEREX_MAX_WAVELENGTH_UM,
    SPHEREX_MIN_WAVELENGTH_UM,
    get_spherex_band,
    infrared_to_visible_nm,
)


class SpectralColorTests(unittest.TestCase):
    def test_band_centers_preserve_logarithmic_spectral_order(self) -> None:
        visible_centers = [band.visible_center_nm for band in SPHEREX_BANDS]

        self.assertEqual(len(SPHEREX_BANDS), 6)
        self.assertEqual(visible_centers, sorted(visible_centers))
        self.assertAlmostEqual(
            float(infrared_to_visible_nm(SPHEREX_MIN_WAVELENGTH_UM)),
            420.0,
        )
        self.assertAlmostEqual(
            float(infrared_to_visible_nm(SPHEREX_MAX_WAVELENGTH_UM)),
            640.0,
        )

        d1 = get_spherex_band("SPHEREx-D1").display_rgb
        d4 = get_spherex_band("SPHEREx-D4").display_rgb
        d5 = get_spherex_band("SPHEREx-D5").display_rgb
        d6 = get_spherex_band("SPHEREx-D6").display_rgb
        self.assertGreater(d1[2], d1[0])
        self.assertGreater(d4[0], d4[1])
        self.assertNotEqual(d5, d6)

    def test_generates_transparent_per_pixel_false_color_webp(self) -> None:
        data = np.array([[0.0, 1.0], [np.nan, 2.0]], dtype=np.float32)
        wavelengths = np.array(
            [[0.744, 1.116], [np.nan, 5.002]],
            dtype=np.float32,
        )
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "frame.webp"
            frame = generate_frame_from_array(
                data,
                path,
                wavelength_um=wavelengths,
                vertically_flip=False,
            )
            image = Image.open(path).convert("RGBA")
            pixels = np.asarray(image)

        self.assertTrue(frame.colorized)
        self.assertEqual(frame.color_model, "SPHEREx log-λ false color")
        self.assertAlmostEqual(frame.opacity, 0.82)
        self.assertEqual(pixels[1, 0, 3], 0)
        self.assertEqual(pixels[0, 0, 3], round(0.82 * 255))
        self.assertEqual(pixels[1, 1, 3], round(0.82 * 255))
        self.assertNotEqual(tuple(pixels[0, 1, :3]), tuple(pixels[1, 1, :3]))

    def test_rejects_unknown_band(self) -> None:
        with self.assertRaises(ValueError):
            get_spherex_band("SPHEREx-D7")


if __name__ == "__main__":
    unittest.main()
