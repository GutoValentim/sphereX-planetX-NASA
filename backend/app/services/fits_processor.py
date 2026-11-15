"""Inspeção inicial de produtos FITS multi-extensão da SPHEREx."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from astropy.coordinates import SkyCoord
from astropy.io import fits
from astropy.wcs import WCS


REQUIRED_SPHEREX_EXTENSIONS = frozenset({"IMAGE", "FLAGS", "VARIANCE"})


def inspect_fits(
    path: Path,
    *,
    target_ra_deg: float | None = None,
    target_dec_deg: float | None = None,
) -> dict[str, Any]:
    """Resume extensões, metadados e posição do alvo em um FITS SPHEREx."""

    if (target_ra_deg is None) != (target_dec_deg is None):
        raise ValueError("target_ra_deg e target_dec_deg devem ser informados juntos.")

    resolved_path = path.expanduser().resolve(strict=True)
    with fits.open(resolved_path, memmap=True, lazy_load_hdus=False) as hdus:
        extensions = []
        for hdu in hdus:
            data = hdu.data
            extensions.append(
                {
                    "name": hdu.name,
                    "kind": type(hdu).__name__,
                    "shape": list(data.shape) if data is not None else None,
                    "dtype": str(data.dtype) if data is not None else None,
                    "unit": hdu.header.get("BUNIT"),
                }
            )

        extension_names = {hdu.name for hdu in hdus}
        missing = sorted(REQUIRED_SPHEREX_EXTENSIONS - extension_names)
        image_header = hdus["IMAGE"].header if "IMAGE" in extension_names else None
        target_pixel = None

        if image_header is not None and target_ra_deg is not None and target_dec_deg is not None:
            image_shape = hdus["IMAGE"].data.shape
            coordinate = SkyCoord(target_ra_deg, target_dec_deg, unit="deg", frame="icrs")
            x_pixel, y_pixel = WCS(image_header).world_to_pixel(coordinate)
            target_pixel = {
                "x": float(x_pixel),
                "y": float(y_pixel),
                "inside_image": bool(
                    0 <= x_pixel < image_shape[-1] and 0 <= y_pixel < image_shape[-2]
                ),
            }

        return {
            "path": str(resolved_path),
            "size_bytes": resolved_path.stat().st_size,
            "is_spherex_spectral_image": not missing,
            "missing_required_extensions": missing,
            "extensions": extensions,
            "image_metadata": _image_metadata(image_header),
            "target_pixel": target_pixel,
        }


def _image_metadata(header: fits.Header | None) -> dict[str, Any] | None:
    if header is None:
        return None
    keys = ("DETECTOR", "OBSID", "DATE", "BUNIT", "PSF_FWHM")
    return {key.lower(): header.get(key) for key in keys}
