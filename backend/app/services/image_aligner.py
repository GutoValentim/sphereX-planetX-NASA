"""Reprojeção astrométrica de imagens FITS para uma grade celeste comum."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from math import ceil, sqrt
from pathlib import Path
from typing import Any

from astropy.coordinates import SkyCoord
from astropy.io import fits
from astropy.wcs import WCS
from astropy.wcs.utils import proj_plane_pixel_area
import numpy as np
from reproject import reproject_interp


ALIGNMENT_VERSION = 1


@dataclass(frozen=True)
class CommonSkyGrid:
    """Grade TAN determinística compartilhada por todos os frames do dataset."""

    version: int
    center_ra_deg: float
    center_dec_deg: float
    fov_arcmin: float
    pixel_scale_arcsec: float
    width: int
    height: int
    wcs_header: dict[str, Any]

    @property
    def shape(self) -> tuple[int, int]:
        return (self.height, self.width)

    @property
    def wcs(self) -> WCS:
        return WCS(fits.Header(self.wcs_header)).celestial

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> CommonSkyGrid:
        grid = cls(
            version=int(data["version"]),
            center_ra_deg=float(data["center_ra_deg"]),
            center_dec_deg=float(data["center_dec_deg"]),
            fov_arcmin=float(data["fov_arcmin"]),
            pixel_scale_arcsec=float(data["pixel_scale_arcsec"]),
            width=int(data["width"]),
            height=int(data["height"]),
            wcs_header=dict(data["wcs_header"]),
        )
        if grid.version != ALIGNMENT_VERSION:
            raise ValueError("Versão da grade de alinhamento incompatível.")
        return grid


@dataclass(frozen=True)
class AlignedImage:
    """Imagem reprojetada e sua cobertura útil na grade comum."""

    data: np.ndarray
    source_unit: str | None
    coverage_fraction: float
    center_covered: bool
    wavelength_um: np.ndarray | None
    wavelength_min_um: float | None
    wavelength_max_um: float | None
    wavelength_median_um: float | None


def build_common_sky_grid(
    fits_path: Path,
    *,
    center_ra_deg: float,
    center_dec_deg: float,
    fov_arcmin: float,
    pixel_scale_arcsec: float | None = None,
    source_hdu: str = "IMAGE",
) -> CommonSkyGrid:
    """Cria uma grade TAN norte-para-cima centrada no alvo solicitado."""

    if not 0 < fov_arcmin <= 60:
        raise ValueError("fov_arcmin deve estar no intervalo (0, 60].")
    if pixel_scale_arcsec is not None and pixel_scale_arcsec <= 0:
        raise ValueError("pixel_scale_arcsec deve ser maior que zero.")
    if not 0 <= center_ra_deg < 360 or not -90 <= center_dec_deg <= 90:
        raise ValueError("Centro celeste fora dos limites de RA/Dec.")

    source = fits_path.expanduser().resolve(strict=True)
    with fits.open(source, memmap=True) as hdus:
        if source_hdu not in hdus:
            raise ValueError(f"O FITS não contém a extensão {source_hdu!r}.")
        source_wcs = WCS(hdus[source_hdu].header).celestial

    if not source_wcs.has_celestial or source_wcs.pixel_n_dim != 2:
        raise ValueError("A extensão científica não possui WCS celeste bidimensional.")

    pixel_area_deg2 = abs(float(proj_plane_pixel_area(source_wcs)))
    source_pixel_scale_deg = sqrt(pixel_area_deg2)
    pixel_scale_deg = (
        source_pixel_scale_deg
        if pixel_scale_arcsec is None
        else pixel_scale_arcsec / 3600
    )
    if not np.isfinite(pixel_scale_deg) or pixel_scale_deg <= 0:
        raise ValueError("Não foi possível determinar a escala angular do FITS.")

    size = max(3, ceil((fov_arcmin / 60) / pixel_scale_deg))
    if size % 2 == 0:
        size += 1

    target_wcs = WCS(naxis=2)
    target_wcs.wcs.ctype = ["RA---TAN", "DEC--TAN"]
    target_wcs.wcs.cunit = ["deg", "deg"]
    target_wcs.wcs.crval = [center_ra_deg, center_dec_deg]
    target_wcs.wcs.crpix = [(size + 1) / 2, (size + 1) / 2]
    target_wcs.wcs.cdelt = [-pixel_scale_deg, pixel_scale_deg]
    target_wcs.array_shape = (size, size)

    center = SkyCoord(center_ra_deg, center_dec_deg, unit="deg", frame="icrs")
    center_x, center_y = target_wcs.world_to_pixel(center)
    expected = (size - 1) / 2
    residual = float(np.hypot(center_x - expected, center_y - expected))
    if residual > 1e-6:
        raise ValueError("A grade comum não posicionou o alvo no pixel central.")

    header = target_wcs.to_header(relax=True)
    return CommonSkyGrid(
        version=ALIGNMENT_VERSION,
        center_ra_deg=center_ra_deg,
        center_dec_deg=center_dec_deg,
        fov_arcmin=fov_arcmin,
        pixel_scale_arcsec=pixel_scale_deg * 3600,
        width=size,
        height=size,
        wcs_header=dict(header),
    )


def align_fits_image(
    fits_path: Path,
    grid: CommonSkyGrid,
    *,
    source_hdu: str = "IMAGE",
    interpolation_order: str = "bilinear",
) -> AlignedImage:
    """Reprojeta um FITS para a grade comum usando sua WCS completa."""

    source = fits_path.expanduser().resolve(strict=True)
    with fits.open(source, memmap=True) as hdus:
        if source_hdu not in hdus:
            raise ValueError(f"O FITS não contém a extensão {source_hdu!r}.")
        hdu = hdus[source_hdu]
        data = np.asarray(hdu.data, dtype=np.float32)
        source_wcs = WCS(hdu.header).celestial
        source_unit = hdu.header.get("BUNIT")
        source_wavelength = _source_wavelength_map(hdus, hdu, data.shape)

    if data.ndim != 2:
        raise ValueError(f"A extensão {source_hdu!r} deve ser bidimensional.")
    if not source_wcs.has_celestial or source_wcs.pixel_n_dim != 2:
        raise ValueError("A extensão científica não possui WCS celeste bidimensional.")

    reprojected, footprint = reproject_interp(
        (data, source_wcs),
        grid.wcs,
        shape_out=grid.shape,
        order=interpolation_order,
        roundtrip_coords=True,
        return_footprint=True,
    )
    aligned = np.asarray(reprojected, dtype=np.float32)
    coverage = np.asarray(footprint, dtype=np.float32)
    valid = np.isfinite(aligned) & (coverage > 0)
    aligned[~valid] = np.nan
    center_y = grid.height // 2
    center_x = grid.width // 2
    center_covered = bool(valid[center_y, center_x])
    if not center_covered:
        raise ValueError("A observação não cobre o centro da grade comum.")

    aligned_wavelength = None
    wavelength_min = None
    wavelength_max = None
    wavelength_median = None
    if source_wavelength is not None:
        reprojected_wavelength, wavelength_footprint = reproject_interp(
            (source_wavelength, source_wcs),
            grid.wcs,
            shape_out=grid.shape,
            order=interpolation_order,
            roundtrip_coords=True,
            return_footprint=True,
        )
        aligned_wavelength = np.asarray(reprojected_wavelength, dtype=np.float32)
        wavelength_valid = (
            valid
            & np.isfinite(aligned_wavelength)
            & (np.asarray(wavelength_footprint) > 0)
        )
        aligned_wavelength[~wavelength_valid] = np.nan
        if wavelength_valid.any():
            values = aligned_wavelength[wavelength_valid]
            wavelength_min = float(np.min(values))
            wavelength_max = float(np.max(values))
            wavelength_median = float(np.median(values))

    return AlignedImage(
        data=aligned,
        source_unit=source_unit,
        coverage_fraction=float(np.count_nonzero(valid) / valid.size),
        center_covered=center_covered,
        wavelength_um=aligned_wavelength,
        wavelength_min_um=wavelength_min,
        wavelength_max_um=wavelength_max,
        wavelength_median_um=wavelength_median,
    )


def _source_wavelength_map(
    hdus: fits.HDUList,
    image_hdu: fits.ImageHDU,
    shape: tuple[int, ...],
) -> np.ndarray | None:
    """Avalia o WCS-WAVE tabular do SPHEREx na grade original do cutout."""

    if "WCS-WAVE" not in hdus or len(shape) != 2:
        return None
    try:
        spectral_header = image_hdu.header.copy()
        sip_orders = {"A_ORDER", "B_ORDER", "AP_ORDER", "BP_ORDER"}
        sip_prefixes = ("A_", "B_", "AP_", "BP_")
        for keyword in tuple(spectral_header):
            if keyword in sip_orders or keyword.startswith(sip_prefixes):
                del spectral_header[keyword]
        spectral_wcs = WCS(spectral_header, hdus, key="W")
        yy, xx = np.indices(shape, dtype=np.float64)
        coordinates = np.column_stack((xx.ravel(), yy.ravel()))
        spectral_values = spectral_wcs.all_pix2world(coordinates, 0)
        wavelength = np.asarray(spectral_values[:, 0], dtype=np.float32).reshape(shape)
    except (KeyError, TypeError, ValueError):
        return None
    if not np.isfinite(wavelength).any():
        return None
    return wavelength


def source_wavelength_map(
    hdus: fits.HDUList,
    image_hdu: fits.ImageHDU,
    shape: tuple[int, ...],
) -> np.ndarray | None:
    """Mapa λ (µm) por pixel na grade original do FITS, a partir do ``WCS-WAVE``."""

    return _source_wavelength_map(hdus, image_hdu, shape)
