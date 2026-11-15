"""Orquestra consulta, cutout e geração de uma imagem de apresentação."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

from app.schemas.observations import ObservationQuery, ObservationRecord
from app.services.frame_generator import GeneratedFrame, generate_frame
from app.services.irsa_client import IrsaClient


@dataclass(frozen=True)
class PreviewImageResult:
    """Resultado completo para a futura camada de API."""

    observation: ObservationRecord
    fits_path: str
    frame: GeneratedFrame

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class SpherexImageService:
    """Produz um frame a partir de RA, Dec e campo de visão."""

    def __init__(self, irsa_client: IrsaClient | None = None) -> None:
        self.irsa_client = irsa_client or IrsaClient()

    def create_preview(
        self,
        *,
        ra_deg: float,
        dec_deg: float,
        fov_arcmin: float,
        output_path: Path,
        fits_cache_directory: Path,
        collections: tuple[str, ...] = ("spherex_dr1", "spherex_qr3"),
        start_time: datetime | None = None,
        end_time: datetime | None = None,
        bandpass: str | None = None,
    ) -> PreviewImageResult:
        """Seleciona a primeira observação compatível e gera seu frame."""

        if not 0 < fov_arcmin <= 60:
            raise ValueError("fov_arcmin deve estar no intervalo (0, 60].")

        query = ObservationQuery(
            ra_deg=ra_deg,
            dec_deg=dec_deg,
            radius_arcsec=fov_arcmin * 60 / 2,
            collections=collections,
            start_time=start_time,
            end_time=end_time,
        )
        observations = self.irsa_client.search(query)
        candidates = [
            observation
            for observation in observations
            if bandpass is None or observation.bandpass == bandpass
        ]
        if not candidates:
            suffix = f" para a banda {bandpass}" if bandpass else ""
            raise LookupError(f"Nenhuma observação SPHEREx encontrada{suffix}.")

        selected = candidates[0]
        fits_path = self.irsa_client.download(
            selected,
            fits_cache_directory,
            cutout_center=(ra_deg, dec_deg),
            cutout_size_deg=fov_arcmin / 60,
        )
        frame = generate_frame(fits_path, output_path)
        return PreviewImageResult(
            observation=selected,
            fits_path=str(fits_path),
            frame=frame,
        )
