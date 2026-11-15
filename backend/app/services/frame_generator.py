"""Conversão de uma imagem científica FITS em frame para apresentação web."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

from astropy.io import fits
from astropy.stats import sigma_clipped_stats
from astropy.visualization import AsinhStretch, LinearStretch, LogStretch, SqrtStretch
import numpy as np
from PIL import Image
from scipy import ndimage

from app.services.spectral_color import (
    FALSE_COLOR_OPACITY,
    infrared_to_rgb,
    infrared_to_visible_nm,
)


SUPPORTED_IMAGE_FORMATS = frozenset({"PNG", "WEBP", "JPEG"})
BACKGROUND_MODES = frozenset({"none", "global", "local"})
STRETCHES = frozenset({"asinh", "sqrt", "linear", "log"})
COLOR_MODES = ("color", "mono")


@dataclass(frozen=True)
class RenderProfile:
    """Parâmetros de apresentação aplicados igualmente a todas as épocas.

    Nada aqui altera o FITS: são escolhas de exibição (fundo, ponto preto,
    curva de brilho e suavização) sobre a matriz científica já alinhada.
    """

    name: str
    label: str
    description: str
    background: str = "none"
    black_sigma: float | None = None
    lower_percentile: float = 1.0
    upper_percentile: float = 99.0
    stretch: str = "asinh"
    stretch_a: float = 0.1
    smooth_sigma_px: float = 0.0
    fill_saturated_cores: bool = False

    def __post_init__(self) -> None:
        if self.background not in BACKGROUND_MODES:
            raise ValueError(f"Fundo inválido: {self.background!r}.")
        if self.stretch not in STRETCHES:
            raise ValueError(f"Curva inválida: {self.stretch!r}.")
        if not 0 <= self.lower_percentile < self.upper_percentile <= 100:
            raise ValueError("Os percentis devem obedecer 0 <= inferior < superior <= 100.")
        if self.stretch_a <= 0 or self.smooth_sigma_px < 0:
            raise ValueError("stretch_a deve ser positivo e smooth_sigma_px não negativo.")

    @property
    def stretch_label(self) -> str:
        if self.stretch in {"asinh", "log"}:
            return f"{self.stretch}(a={self.stretch_a:g})"
        return self.stretch

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


RENDER_PROFILES: dict[str, RenderProfile] = {
    profile.name: profile
    for profile in (
        RenderProfile(
            "original",
            "Original",
            "Como antes: percentis 1–99 e asinh forte; realça ruído e halos.",
        ),
        RenderProfile(
            "limpa",
            "Limpa",
            "Remove o fundo suave (luz zodiacal), ponto preto logo acima do ruído e asinh mais suave.",
            background="local",
            black_sigma=0.5,
            upper_percentile=99.8,
            stretch_a=0.2,
            fill_saturated_cores=True,
        ),
        RenderProfile(
            "suave",
            "Suave",
            "Igual à Limpa com leve suavização gaussiana (0,8 px) para reduzir o granulado.",
            background="local",
            black_sigma=0.5,
            upper_percentile=99.8,
            stretch_a=0.2,
            smooth_sigma_px=0.8,
            fill_saturated_cores=True,
        ),
        RenderProfile(
            "difusa",
            "Difusa",
            "Subtrai só um nível global; preserva nebulosidade e emissão estendida.",
            background="global",
            black_sigma=0.0,
            upper_percentile=99.9,
            stretch_a=0.15,
            smooth_sigma_px=0.5,
            fill_saturated_cores=True,
        ),
        RenderProfile(
            "pontual",
            "Pontual",
            "Fundo removido, ponto preto 2,5σ e curva suave: quase só as fontes, halos mínimos.",
            background="local",
            black_sigma=2.5,
            upper_percentile=99.95,
            stretch="sqrt",
            fill_saturated_cores=True,
        ),
    )
}
DEFAULT_RENDER_PROFILE = "original"


def get_render_profile(name: str | RenderProfile) -> RenderProfile:
    if isinstance(name, RenderProfile):
        return name
    try:
        return RENDER_PROFILES[name]
    except KeyError as error:
        choices = ", ".join(RENDER_PROFILES)
        raise ValueError(f"Perfil de renderização inválido. Use um de: {choices}.") from error


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
    aligned: bool = False
    center_ra_deg: float | None = None
    center_dec_deg: float | None = None
    coverage_fraction: float | None = None
    colorized: bool = False
    color_model: str | None = None
    wavelength_min_um: float | None = None
    wavelength_max_um: float | None = None
    wavelength_median_um: float | None = None
    visible_wavelength_min_nm: float | None = None
    visible_wavelength_max_nm: float | None = None
    visible_wavelength_median_nm: float | None = None
    false_color_rgb: tuple[int, int, int] | None = None
    opacity: float = 1.0
    render_profile: str = DEFAULT_RENDER_PROFILE
    background_mode: str = "none"
    noise_sigma: float | None = None
    smoothing_sigma_px: float = 0.0

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

    source = fits_path.expanduser().resolve(strict=True)

    with fits.open(source, memmap=True) as hdus:
        if source_hdu not in hdus:
            raise ValueError(f"O FITS não contém a extensão {source_hdu!r}.")
        hdu = hdus[source_hdu]
        data = np.asarray(hdu.data, dtype=np.float32)
        source_unit = hdu.header.get("BUNIT")

    return generate_frame_from_array(
        data,
        output_path,
        source_hdu=source_hdu,
        source_unit=source_unit,
        lower_percentile=lower_percentile,
        upper_percentile=upper_percentile,
        display_min=display_min,
        display_max=display_max,
        vertically_flip=vertically_flip,
    )


def generate_frame_from_array(
    data: np.ndarray,
    output_path: Path,
    *,
    source_hdu: str = "IMAGE",
    source_unit: str | None = None,
    lower_percentile: float = 1.0,
    upper_percentile: float = 99.0,
    display_min: float | None = None,
    display_max: float | None = None,
    vertically_flip: bool = True,
    aligned: bool = False,
    center_ra_deg: float | None = None,
    center_dec_deg: float | None = None,
    coverage_fraction: float | None = None,
    wavelength_um: np.ndarray | float | None = None,
    false_color_opacity: float = FALSE_COLOR_OPACITY,
    render_profile: str | RenderProfile = DEFAULT_RENDER_PROFILE,
) -> GeneratedFrame:
    """Gera um frame web a partir de uma matriz científica bidimensional.

    ``display_min``/``display_max`` estão nas unidades da matriz já processada
    pelo perfil (após suavização e subtração de fundo). Reutilize os valores do
    primeiro frame em todas as épocas para manter a mesma escala visual.
    """

    profile = get_render_profile(render_profile)

    if not 0 <= lower_percentile < upper_percentile <= 100:
        raise ValueError("Os percentis devem obedecer 0 <= inferior < superior <= 100.")
    if (display_min is None) != (display_max is None):
        raise ValueError("display_min e display_max devem ser informados juntos.")
    if display_min is not None and display_max is not None and display_min >= display_max:
        raise ValueError("display_min deve ser menor que display_max.")
    if aligned and (center_ra_deg is None or center_dec_deg is None):
        raise ValueError("Frames alinhados devem informar o centro celeste.")
    if wavelength_um is not None and not 0 < false_color_opacity <= 1:
        raise ValueError("false_color_opacity deve estar no intervalo (0, 1].")

    image_format = _format_from_path(output_path)
    data = np.asarray(data, dtype=np.float32)

    if data.ndim != 2:
        raise ValueError(f"A extensão {source_hdu!r} deve ser bidimensional.")

    valid = np.isfinite(data)
    if not valid.any():
        raise ValueError(f"A extensão {source_hdu!r} não contém pixels finitos.")

    if profile.name != DEFAULT_RENDER_PROFILE:
        lower_percentile = profile.lower_percentile
        upper_percentile = profile.upper_percentile
    if profile.fill_saturated_cores:
        data, valid = _fill_saturated_cores(data, valid)
    data = _smooth(data, valid, profile.smooth_sigma_px)
    data = data - _background(data, valid, profile.background)
    noise_sigma = _noise_sigma(data, valid)

    if display_min is None or display_max is None:
        display_max = float(np.percentile(data[valid], upper_percentile))
        if profile.black_sigma is not None:
            display_min = float(profile.black_sigma * noise_sigma)
        else:
            display_min = float(np.percentile(data[valid], lower_percentile))
        if display_max <= display_min:
            display_max = display_min + max(noise_sigma, 1e-6)

    if display_min >= display_max:
        raise ValueError("O intervalo de visualização calculado é vazio.")

    normalized = np.zeros(data.shape, dtype=np.float32)
    normalized[valid] = np.clip(
        (data[valid] - display_min) / (display_max - display_min), 0.0, 1.0
    )
    stretched = _stretch(profile)(normalized, clip=True)
    pixels = np.rint(stretched * 255).astype(np.uint8)

    colorized = wavelength_um is not None
    wavelength_min = None
    wavelength_max = None
    wavelength_median = None
    visible_min = None
    visible_max = None
    visible_median = None
    false_color_rgb = None
    if colorized:
        wavelengths = np.asarray(wavelength_um, dtype=np.float32)
        if wavelengths.ndim == 0:
            wavelengths = np.full(data.shape, float(wavelengths), dtype=np.float32)
        if wavelengths.shape != data.shape:
            raise ValueError("O mapa de comprimentos de onda deve acompanhar a imagem.")
        known = np.isfinite(wavelengths)
        if profile.fill_saturated_cores and known.any() and (valid & ~known).any():
            # Núcleos preenchidos não têm λ: usa o comprimento de onda do vizinho mais
            # próximo (o mapa varia suavemente) para não deixar um anel transparente.
            nearest = ndimage.distance_transform_edt(
                ~known, return_distances=False, return_indices=True
            )
            wavelengths = np.where(known, wavelengths, wavelengths[tuple(nearest)])
        spectral_valid = valid & np.isfinite(wavelengths)
        if not spectral_valid.any():
            raise ValueError("O mapa espectral não contém comprimentos de onda válidos.")

        spectral_values = wavelengths[spectral_valid]
        wavelength_min = float(np.min(spectral_values))
        wavelength_max = float(np.max(spectral_values))
        wavelength_median = float(np.median(spectral_values))
        visible_values = infrared_to_visible_nm(
            np.array([wavelength_min, wavelength_max, wavelength_median])
        )
        visible_min = float(visible_values[0])
        visible_max = float(visible_values[1])
        visible_median = float(visible_values[2])
        median_rgb = infrared_to_rgb(wavelength_median)
        false_color_rgb = tuple(int(value) for value in median_rgb)

        color = infrared_to_rgb(np.where(spectral_valid, wavelengths, wavelength_median))
        rgb = np.rint(
            pixels[..., np.newaxis].astype(np.float32)
            * color.astype(np.float32)
            / 255
        ).astype(np.uint8)
        alpha = np.zeros(data.shape, dtype=np.uint8)
        alpha[spectral_valid] = round(false_color_opacity * 255)
        output_pixels = np.dstack((rgb, alpha))
    else:
        output_pixels = pixels

    if vertically_flip:
        output_pixels = np.flipud(output_pixels)

    destination = output_path.expanduser().resolve()
    destination.parent.mkdir(parents=True, exist_ok=True)
    image = Image.fromarray(output_pixels)
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
        stretch=profile.stretch_label,
        vertically_flipped=vertically_flip,
        aligned=aligned,
        center_ra_deg=center_ra_deg,
        center_dec_deg=center_dec_deg,
        coverage_fraction=coverage_fraction,
        colorized=colorized,
        color_model="SPHEREx log-λ false color" if colorized else None,
        wavelength_min_um=wavelength_min,
        wavelength_max_um=wavelength_max,
        wavelength_median_um=wavelength_median,
        visible_wavelength_min_nm=visible_min,
        visible_wavelength_max_nm=visible_max,
        visible_wavelength_median_nm=visible_median,
        false_color_rgb=false_color_rgb,
        opacity=false_color_opacity if colorized else 1.0,
        render_profile=profile.name,
        background_mode=profile.background,
        noise_sigma=noise_sigma,
        smoothing_sigma_px=profile.smooth_sigma_px,
    )


def _stretch(profile: RenderProfile) -> Any:
    if profile.stretch == "asinh":
        return AsinhStretch(a=profile.stretch_a)
    if profile.stretch == "log":
        return LogStretch(a=profile.stretch_a)
    if profile.stretch == "sqrt":
        return SqrtStretch()
    return LinearStretch()


MAX_CORE_HOLE_PX = 64


def _fill_saturated_cores(
    data: np.ndarray, valid: np.ndarray
) -> tuple[np.ndarray, np.ndarray]:
    """Preenche núcleos saturados (NaN cercados por pixels válidos) só para exibição.

    O pipeline do SPHEREx descarta pixels saturados, o que deixa um ponto preto
    no centro das estrelas mais brilhantes. Buracos pequenos e totalmente
    internos recebem o maior valor vizinho, que é o que "saturado" significa;
    bordas sem cobertura (NaN tocando a borda) continuam vazias.
    """

    holes = ndimage.binary_fill_holes(valid) & ~valid
    if not holes.any():
        return data, valid
    labels, count = ndimage.label(holes)
    sizes = ndimage.sum(holes, labels, range(1, count + 1))
    small = np.isin(labels, np.flatnonzero(sizes <= MAX_CORE_HOLE_PX) + 1)
    if not small.any():
        return data, valid
    filled = np.where(valid, data, -np.inf).astype(np.float32)
    pending = small.copy()
    for _ in range(MAX_CORE_HOLE_PX):
        grown = ndimage.grey_dilation(filled, size=3)
        update = pending & np.isfinite(grown)
        filled[update] = grown[update]
        pending &= ~update
        if not pending.any():
            break
    result = data.copy()
    result[small & ~pending] = filled[small & ~pending]
    return result, valid | (small & ~pending)


def _smooth(data: np.ndarray, valid: np.ndarray, sigma_px: float) -> np.ndarray:
    """Suavização gaussiana que ignora pixels inválidos (convolução normalizada)."""

    if sigma_px <= 0:
        return data
    filled = np.where(valid, data, 0).astype(np.float32)
    weight = valid.astype(np.float32)
    numerator = ndimage.gaussian_filter(filled, sigma_px, mode="nearest")
    denominator = ndimage.gaussian_filter(weight, sigma_px, mode="nearest")
    with np.errstate(invalid="ignore", divide="ignore"):
        smoothed = numerator / denominator
    return np.where(valid, smoothed, np.nan).astype(np.float32)


def _background(data: np.ndarray, valid: np.ndarray, mode: str) -> np.ndarray | float:
    """Estima o fundo difuso; fontes compactas são rejeitadas por sigma-clipping."""

    if mode == "none":
        return 0.0
    _, global_median, _ = sigma_clipped_stats(data[valid], sigma=3.0, maxiters=5)
    if mode == "global":
        return float(global_median)

    # Malha de caixas (~1/6 da imagem, mínimo 16 px), como um Background2D simples:
    # mediana robusta por caixa, filtro 3x3 entre caixas e interpolação bilinear.
    height, width = data.shape
    box = max(16, round(min(height, width) / 6))
    rows = max(1, round(height / box))
    cols = max(1, round(width / box))
    row_edges = np.linspace(0, height, rows + 1).astype(int)
    col_edges = np.linspace(0, width, cols + 1).astype(int)
    mesh = np.full((rows, cols), np.nan, dtype=np.float64)
    for row in range(rows):
        for col in range(cols):
            window = (
                slice(row_edges[row], row_edges[row + 1]),
                slice(col_edges[col], col_edges[col + 1]),
            )
            values = data[window][valid[window]]
            if values.size >= 0.3 * data[window].size and values.size >= 10:
                mesh[row, col] = sigma_clipped_stats(values, sigma=3.0, maxiters=5)[1]
    mesh[~np.isfinite(mesh)] = global_median
    if min(rows, cols) >= 3:
        # Reflexão ímpar = extrapolação linear: o filtro remove caixas contaminadas
        # por fontes grandes sem achatar gradientes reais nos cantos.
        padded = np.pad(mesh, 1, mode="reflect", reflect_type="odd")
        mesh = ndimage.median_filter(padded, size=3)[1:-1, 1:-1]
    # Bilinear entre centros de caixa, com extrapolação linear até as bordas
    # (travar no valor da última caixa deixaria um degradê residual nos cantos).
    y = (np.arange(height) + 0.5) / height * rows - 0.5
    x = (np.arange(width) + 0.5) / width * cols - 0.5
    return _linear_resample(_linear_resample(mesh, y, axis=0), x, axis=1).astype(np.float32)


def _linear_resample(values: np.ndarray, positions: np.ndarray, *, axis: int) -> np.ndarray:
    count = values.shape[axis]
    if count == 1:
        return np.repeat(values, positions.size, axis=axis)
    lower = np.clip(np.floor(positions).astype(int), 0, count - 2)
    fraction = positions - lower
    first = np.take(values, lower, axis=axis)
    second = np.take(values, lower + 1, axis=axis)
    shape = [1, 1]
    shape[axis] = positions.size
    fraction = fraction.reshape(shape)
    return first + (second - first) * fraction


def _noise_sigma(data: np.ndarray, valid: np.ndarray) -> float:
    _, _, std = sigma_clipped_stats(data[valid], sigma=3.0, maxiters=5)
    std = float(std)
    return std if np.isfinite(std) and std > 0 else 0.0


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
