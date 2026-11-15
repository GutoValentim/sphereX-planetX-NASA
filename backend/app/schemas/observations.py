"""Modelos independentes da camada HTTP para consultas ao IRSA."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import datetime
from typing import Any


SPHEREX_SPECTRAL_IMAGE_COLLECTIONS = frozenset(
    {
        "spherex_dr1",
        "spherex_dr1_deep",
        "spherex_qr3",
        "spherex_qr3_deep",
    }
)


@dataclass(frozen=True)
class ObservationQuery:
    """Parâmetros de uma busca circular por imagens espectrais SPHEREx."""

    ra_deg: float
    dec_deg: float
    radius_arcsec: float = 30.0
    collections: tuple[str, ...] = ("spherex_dr1", "spherex_qr3")
    start_time: datetime | None = None
    end_time: datetime | None = None
    max_records: int | None = None

    def __post_init__(self) -> None:
        if not 0 <= self.ra_deg < 360:
            raise ValueError("ra_deg deve estar no intervalo [0, 360).")
        if not -90 <= self.dec_deg <= 90:
            raise ValueError("dec_deg deve estar no intervalo [-90, 90].")
        if not 0 < self.radius_arcsec <= 3600:
            raise ValueError("radius_arcsec deve estar no intervalo (0, 3600].")
        if not self.collections:
            raise ValueError("Informe pelo menos uma coleção SPHEREx.")

        unsupported = set(self.collections) - SPHEREX_SPECTRAL_IMAGE_COLLECTIONS
        if unsupported:
            values = ", ".join(sorted(unsupported))
            raise ValueError(f"Coleções não suportadas para imagens espectrais: {values}.")

        if (self.start_time is None) != (self.end_time is None):
            raise ValueError("start_time e end_time devem ser informados juntos.")
        if self.start_time and self.end_time and self.start_time > self.end_time:
            raise ValueError("start_time deve ser anterior ou igual a end_time.")
        if self.max_records is not None and self.max_records <= 0:
            raise ValueError("max_records deve ser maior que zero.")


@dataclass(frozen=True)
class ObservationRecord:
    """Metadados essenciais de uma imagem encontrada pelo SIA2."""

    observation_id: str
    collection: str
    access_url: str
    access_format: str | None
    estimated_size_kb: int | None
    ra_deg: float | None
    dec_deg: float | None
    observed_at: str | None
    observation_end: str | None
    bandpass: str | None
    instrument: str | None
    spatial_resolution_arcsec: float | None
    spatial_region: str | None = None
    field_of_view_deg: float | None = None
    pixel_scale_arcsec: float | None = None
    exposure_seconds: float | None = None

    def to_dict(self) -> dict[str, Any]:
        """Retorna dados serializáveis para JSON pela futura camada de API."""

        return asdict(self)
