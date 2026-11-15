"""Conversão de uma imagem científica FITS em frame para apresentação web."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

from astropy.io import fits
from astropy.visualization import AsinhStretch
import numpy as np
from PIL import Image


SUPPORTED_IMAGE_FORMATS = frozenset({"PNG", "WEBP", "JPEG"})


@dataclass(frozen=True)
class GeneratedFrame:
    """Metadados da representação visual derivada de um FITS."""

    path: str
    format: str
    width: int
    height: int
    size_bytes: int
    source_hdu: str
    source_unit: str | None
    display_min: float
    display_max: float
    stretch: str
    vertically_flipped: bool

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def generate_frame(
    fits_path: Path,
    output_path: Path,
    *,
    source_hdu: str = "IMAGE",
    lower_percentile: float = 1.0,
    upper_percentile: float = 99.0,
    display_min: float | None = None,
    display_max: float | None = None,
    vertically_flip: bool = True,
) -> GeneratedFrame:
    """Gera uma imagem 8-bit em escala de cinza usando stretch asinh.

    Os percentis fornecem uma primeira visualização robusta. Para comparar épocas,
    informe os mesmos ``display_min`` e ``display_max`` em todos os frames.
    """

    if not 0 <= lower_percentile < upper_percentile <= 100:
        raise ValueError("Os percentis devem obedecer 0 <= inferior < superior <= 100.")
    if (display_min is None) != (display_max is None):
        raise ValueError("display_min e display_max devem ser informados juntos.")
    if display_min is not None and display_max is not None and display_min >= display_max:
        raise ValueError("display_min deve ser menor que display_max.")

    source = fits_path.expanduser().resolve(strict=True)
    image_format = _format_from_path(output_path)

    with fits.open(source, memmap=True) as hdus:
        if source_hdu not in hdus:
            raise ValueError(f"O FITS não contém a extensão {source_hdu!r}.")
        hdu = hdus[source_hdu]
        data = np.asarray(hdu.data, dtype=np.float32)
        source_unit = hdu.header.get("BUNIT")

    if data.ndim != 2:
        raise ValueError(f"A extensão {source_hdu!r} deve ser bidimensional.")

    valid = np.isfinite(data)
    if not valid.any():
        raise ValueError(f"A extensão {source_hdu!r} não contém pixels finitos.")

    if display_min is None or display_max is None:
        display_min, display_max = np.percentile(
            data[valid], [lower_percentile, upper_percentile]
        )
        display_min = float(display_min)
        display_max = float(display_max)

    if display_min >= display_max:
        raise ValueError("O intervalo de visualização calculado é vazio.")

    normalized = np.zeros(data.shape, dtype=np.float32)
    normalized[valid] = np.clip(
        (data[valid] - display_min) / (display_max - display_min), 0.0, 1.0
    )
    stretched = AsinhStretch()(normalized, clip=True)
    pixels = np.rint(stretched * 255).astype(np.uint8)
    if vertically_flip:
        pixels = np.flipud(pixels)

    destination = output_path.expanduser().resolve()
    destination.parent.mkdir(parents=True, exist_ok=True)
    image = Image.fromarray(pixels)
    image.save(destination, format=image_format, **_save_options(image_format))

    return GeneratedFrame(
        path=str(destination),
        format=image_format,
        width=image.width,
        height=image.height,
        size_bytes=destination.stat().st_size,
        source_hdu=source_hdu,
        source_unit=source_unit,
        display_min=display_min,
        display_max=display_max,
        stretch="asinh",
        vertically_flipped=vertically_flip,
    )


def _format_from_path(path: Path) -> str:
    suffix = path.suffix.lower()
    formats = {".png": "PNG", ".webp": "WEBP", ".jpg": "JPEG", ".jpeg": "JPEG"}
    image_format = formats.get(suffix)
    if image_format not in SUPPORTED_IMAGE_FORMATS:
        supported = ", ".join(sorted(SUPPORTED_IMAGE_FORMATS))
        raise ValueError(f"Formato não suportado. Use uma extensão de {supported}.")
    return image_format


def _save_options(image_format: str) -> dict[str, Any]:
    if image_format == "PNG":
        return {"optimize": True}
    if image_format == "WEBP":
        return {"lossless": True, "method": 6}
    return {"quality": 90, "optimize": True, "progressive": True}
