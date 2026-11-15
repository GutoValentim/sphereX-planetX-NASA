"""Camada HTTP (FastAPI) do backend científico.

Este serviço não é exposto à internet: a API Node recebe as consultas do
frontend e as encaminha para cá pela rede interna do Docker.

Executar localmente (a partir de ``backend/``)::

    uvicorn app.main:app --port 8000 --reload
"""

from __future__ import annotations

import logging
import os
from pathlib import Path
import re
import time
from typing import Any, Callable, Literal, Protocol, TypeVar

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field

from app.services.spectral_color import SPHEREX_BANDS, get_spherex_band
from app.services.spectrum_jobs import SpectrumJobManager
from app.services.spectrum_service import SpherexSpectrumService
from app.services.temporal_sequence_service import (
    SequenceLimitExceeded,
    SpherexTemporalSequenceService,
    TemporalDataset,
)


logger = logging.getLogger("spherex.python")
T = TypeVar("T")

DEFAULT_CACHE_DIR = Path(__file__).resolve().parents[1] / "cache" / "temporal"
DEFAULT_RELEASE_ENV = Path("/app/.release.env")
SPECTRUM_FILES_PREFIX = "/espectros/arquivos/"
_JOB_ID = re.compile(r"[0-9a-f]{16}")
_SPECTRUM_FILE = re.compile(r"[0-9a-f]{16}/spectrum/[A-Za-z0-9._-]+\.svg")
THEMES = {"escuro": "dark", "claro": "light"}


class DatasetDiscovery(Protocol):
    def discover_dataset(
        self, *, ra_deg: float, dec_deg: float, output_directory: Path
    ) -> TemporalDataset: ...


class Consulta(BaseModel):
    """Corpo enviado pela API Node em ``POST /receber-dados``."""

    RA: float = Field(ge=0, lt=360, description="Ascensão reta em graus (ICRS).")
    DEC: float = Field(ge=-90, le=90, description="Declinação em graus (ICRS).")
    Data: str | None = Field(
        default=None,
        description="Data de referência informada pelo usuário; ainda não filtra a busca.",
    )
    elemento: Literal["imagem", "espectro"] = Field(
        default="imagem",
        description="imagem (padrão): observações da sequência; espectro: gráfico espectral.",
    )
    bandas: list[str] | None = Field(
        default=None,
        description="Só para espectro: ex. ['SPHEREx-D1', 'D3']. Padrão: D1–D6.",
    )
    tema: Literal["escuro", "claro"] = Field(default="escuro", description="Tema dos gráficos.")


def release_version() -> str:
    """SHA publicado: ``GIT_SHA`` ou o arquivo ``.release.env`` da release."""

    if sha := os.environ.get("GIT_SHA"):
        return sha
    path = Path(os.environ.get("SPHEREX_RELEASE_ENV", DEFAULT_RELEASE_ENV))
    try:
        for line in path.read_text(encoding="utf-8").splitlines():
            if line.startswith("GIT_SHA="):
                return line.partition("=")[2].strip()
    except OSError:
        pass
    return "development"


def _error(status: int, message: str, **extra: Any) -> JSONResponse:
    return JSONResponse(status_code=status, content={"erro": message, **extra})


def _with_retry(call: Callable[[], T], *, attempts: int, delay_seconds: float) -> T:
    """Repete falhas transitórias do IRSA; erros de domínio (sem cobertura,
    limite, parâmetros) não são repetidos."""

    for attempt in range(1, attempts + 1):
        try:
            return call()
        except (LookupError, ValueError):
            raise
        except Exception:
            if attempt == attempts:
                raise
            logger.warning("Falha transitória no IRSA (tentativa %d de %d).", attempt, attempts, exc_info=True)
            time.sleep(delay_seconds * attempt)
    raise AssertionError("unreachable")


def normalize_bands(names: list[str] | None) -> list[str]:
    """Aceita 'SPHEREx-D3' ou 'D3'; sem bandas, usa D1–D6."""

    if not names:
        return [band.bandpass for band in SPHEREX_BANDS]
    resolved = []
    for name in names:
        value = name.strip()
        if re.fullmatch(r"[Dd][1-6]", value):
            value = f"SPHEREx-{value.upper()}"
        resolved.append(get_spherex_band(value).bandpass)
    return list(dict.fromkeys(resolved))


def create_app(
    service: DatasetDiscovery | None = None,
    cache_dir: Path | None = None,
    *,
    retry_attempts: int = 3,
    retry_delay_seconds: float = 1.0,
    spectrum_jobs: SpectrumJobManager | None = None,
) -> FastAPI:
    service = service or SpherexTemporalSequenceService(download_workers=4)
    cache_dir = cache_dir or Path(os.environ.get("SPHEREX_CACHE_DIR", DEFAULT_CACHE_DIR))
    version = release_version()

    def spectrum_file_url(path: Path) -> str:
        relative = path.resolve().relative_to(cache_dir.resolve())
        return SPECTRUM_FILES_PREFIX + relative.as_posix()

    spectrum_jobs = spectrum_jobs or SpectrumJobManager(
        SpherexSpectrumService(download_workers=6), cache_dir, spectrum_file_url
    )

    app = FastAPI(title="SPHEREx Python", version=version)

    @app.exception_handler(RequestValidationError)
    async def invalid_request(_request: Request, exc: RequestValidationError) -> JSONResponse:
        return _error(400, "Parâmetros inválidos.", detalhes=jsonable_errors(exc))

    @app.get("/healthz")
    def healthz() -> dict[str, str]:
        return {"status": "ok", "service": "spherex-python", "version": version}

    @app.post("/receber-dados")
    def receber_dados(consulta: Consulta) -> Any:
        """``imagem``: observações que cobrem RA/Dec (sem baixar FITS).
        ``espectro``: inicia o espectro D1–D6 e devolve um job para acompanhar."""

        if consulta.elemento == "espectro":
            return start_spectrum(consulta)

        try:
            dataset = _with_retry(
                lambda: service.discover_dataset(
                    ra_deg=consulta.RA,
                    dec_deg=consulta.DEC,
                    output_directory=cache_dir,
                ),
                attempts=retry_attempts,
                delay_seconds=retry_delay_seconds,
            )
        except SequenceLimitExceeded as exc:
            return _error(422, str(exc))
        except LookupError as exc:
            return _error(404, str(exc))
        except ValueError as exc:
            return _error(400, str(exc))
        except Exception:
            logger.exception("Falha ao consultar o IRSA para %s", consulta)
            return _error(502, "Falha ao consultar o arquivo IRSA.")

        data = dataset.to_dict()
        data.pop("dataset_path", None)  # caminho interno do servidor
        return {"consulta": consulta.model_dump(include={"RA", "DEC", "Data"}), **data}

    def start_spectrum(consulta: Consulta) -> JSONResponse:
        try:
            bands = normalize_bands(consulta.bandas)
        except ValueError as exc:
            return _error(400, str(exc))
        job = spectrum_jobs.start(consulta.RA, consulta.DEC, bands, THEMES[consulta.tema])
        body = {
            "consulta": {**consulta.model_dump(), "bandas": bands},
            "elemento": "espectro",
            "status_url": f"/espectros/{job['job_id']}",
            "job": job,
        }
        return JSONResponse(status_code=202 if job["status"] == "running" else 200, content=body)

    @app.get("/espectros/{job_id}")
    def spectrum_status(job_id: str) -> Any:
        """Progresso por banda; ao concluir, URLs dos SVGs e pontos medidos."""

        if not _JOB_ID.fullmatch(job_id):
            return _error(400, "Identificador de espectro inválido.")
        try:
            return spectrum_jobs.snapshot(job_id)
        except FileNotFoundError as exc:
            return _error(404, str(exc))

    @app.get(SPECTRUM_FILES_PREFIX + "{relative:path}")
    def spectrum_file(relative: str) -> Any:
        """SVG do gráfico (nome com hash do conteúdo: cache imutável)."""

        if not _SPECTRUM_FILE.fullmatch(relative):
            return _error(404, "Gráfico não encontrado.")
        root = cache_dir.resolve()
        target = (root / relative).resolve()
        if not target.is_relative_to(root) or not target.is_file():
            return _error(404, "Gráfico não encontrado.")
        return FileResponse(
            target,
            media_type="image/svg+xml",
            headers={"Cache-Control": "public, max-age=31536000, immutable"},
        )

    return app


def jsonable_errors(exc: RequestValidationError) -> list[dict[str, Any]]:
    return [
        {"campo": ".".join(str(part) for part in error["loc"][1:]), "mensagem": error["msg"]}
        for error in exc.errors()
    ]


app = create_app()
