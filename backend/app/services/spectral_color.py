"""Metadados SPHEREx e translação de infravermelho para falsa cor visível."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from math import sqrt
from typing import Any

import numpy as np


VISIBLE_MIN_NM = 420.0
# Acima de ~645 nm, comprimentos distintos colapsam para o mesmo vermelho em
# sRGB. O limite de 640 nm preserva a ordem espectral e separa visualmente D5/D6.
VISIBLE_MAX_NM = 640.0
FALSE_COLOR_OPACITY = 0.82


@dataclass(frozen=True)
class SpherexBand:
    """Intervalo espectral publicado para um detector SPHEREx."""

    bandpass: str
    detector: int
    wavelength_min_um: float
    wavelength_max_um: float
    resolving_power: int

    @property
    def center_um(self) -> float:
        """Centro geométrico, apropriado para uma escala logarítmica."""

        return sqrt(self.wavelength_min_um * self.wavelength_max_um)

    @property
    def visible_center_nm(self) -> float:
        return float(infrared_to_visible_nm(self.center_um))

    @property
    def display_rgb(self) -> tuple[int, int, int]:
        rgb = visible_wavelength_to_rgb(self.visible_center_nm)
        return tuple(int(value) for value in rgb)

    def to_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data["center_um"] = self.center_um
        data["visible_center_nm"] = self.visible_center_nm
        data["display_rgb"] = self.display_rgb
        return data


SPHEREX_BANDS = (
    SpherexBand("SPHEREx-D1", 1, 0.744, 1.116, 39),
    SpherexBand("SPHEREx-D2", 2, 1.099, 1.651, 41),
    SpherexBand("SPHEREx-D3", 3, 1.636, 2.421, 41),
    SpherexBand("SPHEREx-D4", 4, 2.423, 3.822, 35),
    SpherexBand("SPHEREx-D5", 5, 3.809, 4.420, 112),
    SpherexBand("SPHEREx-D6", 6, 4.412, 5.002, 128),
)
SPHEREX_BANDS_BY_NAME = {band.bandpass: band for band in SPHEREX_BANDS}
SPHEREX_MIN_WAVELENGTH_UM = min(band.wavelength_min_um for band in SPHEREX_BANDS)
SPHEREX_MAX_WAVELENGTH_UM = max(band.wavelength_max_um for band in SPHEREX_BANDS)


def get_spherex_band(bandpass: str) -> SpherexBand:
    """Resolve e valida o identificador publicado pelo SIA2."""

    try:
        return SPHEREX_BANDS_BY_NAME[bandpass]
    except KeyError as error:
        choices = ", ".join(SPHEREX_BANDS_BY_NAME)
        raise ValueError(f"Banda inválida. Use uma de: {choices}.") from error


def infrared_to_visible_nm(wavelength_um: Any) -> np.ndarray:
    """Comprime 0,744–5,002 µm em 420–640 nm preservando razões espectrais.

    A transformação logarítmica mantém iguais os espaçamentos fracionários
    ``Δλ/λ``. Isso é mais adequado às resoluções ``R = λ/Δλ`` do instrumento
    do que uma interpolação linear entre os extremos infravermelhos.
    """

    wavelength = np.asarray(wavelength_um, dtype=np.float64)
    clipped = np.clip(
        wavelength,
        SPHEREX_MIN_WAVELENGTH_UM,
        SPHEREX_MAX_WAVELENGTH_UM,
    )
    position = np.log(clipped / SPHEREX_MIN_WAVELENGTH_UM) / np.log(
        SPHEREX_MAX_WAVELENGTH_UM / SPHEREX_MIN_WAVELENGTH_UM
    )
    return VISIBLE_MIN_NM + position * (VISIBLE_MAX_NM - VISIBLE_MIN_NM)


def visible_wavelength_to_rgb(wavelength_nm: Any) -> np.ndarray:
    """Converte um comprimento de onda visível em um RGB de exibição.

    O resultado é uma representação de falsa cor em sRGB, não uma medição
    colorimétrica do céu. A função aceita escalares ou matrizes NumPy.
    """

    wavelength = np.asarray(wavelength_nm, dtype=np.float64)
    red = np.zeros_like(wavelength)
    green = np.zeros_like(wavelength)
    blue = np.zeros_like(wavelength)

    region = (wavelength >= 380) & (wavelength < 440)
    red[region] = (440 - wavelength[region]) / 60
    blue[region] = 1

    region = (wavelength >= 440) & (wavelength < 490)
    green[region] = (wavelength[region] - 440) / 50
    blue[region] = 1

    region = (wavelength >= 490) & (wavelength < 510)
    green[region] = 1
    blue[region] = (510 - wavelength[region]) / 20

    region = (wavelength >= 510) & (wavelength < 580)
    red[region] = (wavelength[region] - 510) / 70
    green[region] = 1

    region = (wavelength >= 580) & (wavelength < 645)
    red[region] = 1
    green[region] = (645 - wavelength[region]) / 65

    region = (wavelength >= 645) & (wavelength <= 780)
    red[region] = 1

    rgb = np.stack((red, green, blue), axis=-1)
    return np.rint(np.clip(rgb, 0, 1) * 255).astype(np.uint8)


def infrared_to_rgb(wavelength_um: Any) -> np.ndarray:
    """Atalho para a translação infravermelho → visível → sRGB."""

    return visible_wavelength_to_rgb(infrared_to_visible_nm(wavelength_um))
