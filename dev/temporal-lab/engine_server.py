#!/usr/bin/env python3
"""Motor do laboratório SPHEREx: API de sequências temporais e espectros.

Cada versão do motor roda este arquivo a partir de uma cópia congelada do
código (``engines/<id>/code``), com cache próprio, atrás do gateway
``server.py``. Assim, mudanças posteriores no backend não alteram registros já
gerados por versões anteriores.
"""

from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import datetime
from hashlib import sha256
from math import ceil
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import mimetypes
import os
from pathlib import Path
import sys
from threading import Lock, Thread
from time import monotonic
from typing import Any
from urllib.parse import parse_qs, unquote, urlparse


LAB_ROOT = Path(__file__).resolve().parent
PROJECT_ROOT = LAB_ROOT.parents[1]
EXTERNAL_DEV_ROOT = PROJECT_ROOT.parent / "dev"
PUBLIC_ROOT = LAB_ROOT / "public"
CACHE_ROOT = Path(
    os.environ.get(
        "SPHEREX_LAB_CACHE_DIR",
        EXTERNAL_DEV_ROOT / "results" / "temporal-lab-cache",
    )
).expanduser()
sys.path.insert(0, str(PROJECT_ROOT / "backend"))

from app.services.frame_generator import (  # noqa: E402
    COLOR_MODES,
    RENDER_PROFILES,
    get_render_profile,
)
from app.services.temporal_sequence_service import (  # noqa: E402
    FIXED_SEQUENCE_PIXEL_SCALE_ARCSEC,
    FRAME_CACHE_VERSION,
    SequenceLimitExceeded,
    SpherexTemporalSequenceService,
)
from app.services.spectrum_jobs import SpectrumJobManager  # noqa: E402
from app.services.spectrum_service import SpherexSpectrumService  # noqa: E402
from app.services.spectral_color import (  # noqa: E402
    SPHEREX_BANDS,
    get_spherex_band,
)


# Janela final (FOV) em arcmin. O recorte-fonte cresce na mesma proporção
# (1,5×) para que rotações e a reprojeção nunca deixem cantos sem dados.
FOV_OPTIONS = (10.0, 15.0, 20.0, 30.0, 40.0)
DEFAULT_FOV_ARCMIN = 30.0
CUTOUT_RATIO = 1.5
SAMPLING_OPTIONS = {
    "native": FIXED_SEQUENCE_PIXEL_SCALE_ARCSEC,
    "2x": FIXED_SEQUENCE_PIXEL_SCALE_ARCSEC / 2,
}
DEFAULT_SAMPLING = "native"
DEFAULT_RENDER_PROFILE = "limpa"

_SERVICES: dict[tuple[str, float, str], SpherexTemporalSequenceService] = {}
_SERVICES_LOCK = Lock()


def service_for(
    bandpass: str,
    fov_arcmin: float = DEFAULT_FOV_ARCMIN,
    sampling: str = DEFAULT_SAMPLING,
) -> SpherexTemporalSequenceService:
    band = get_spherex_band(bandpass)
    key = (band.bandpass, float(fov_arcmin), sampling)
    with _SERVICES_LOCK:
        service = _SERVICES.get(key)
        if service is None:
            service = SpherexTemporalSequenceService(
                bandpass=band.bandpass,
                fov_arcmin=key[1],
                cutout_fov_arcmin=key[1] * CUTOUT_RATIO,
                pixel_scale_arcsec=SAMPLING_OPTIONS[sampling],
                download_workers=8,
            )
            _SERVICES[key] = service
        return service


def service_for_dataset(dataset: Any) -> SpherexTemporalSequenceService:
    sampling = next(
        (name for name, scale in SAMPLING_OPTIONS.items()
         if abs(scale - dataset.pixel_scale_arcsec) < 1e-9),
        DEFAULT_SAMPLING,
    )
    return service_for(dataset.bandpass, dataset.fov_arcmin, sampling)


DEFAULT_SERVICE = service_for("SPHEREx-D3")


def parse_render_settings(payload: dict[str, Any]) -> dict[str, Any]:
    """Valida FOV, amostragem, perfil de renderização e modo de cor."""

    fov = float(payload.get("fov_arcmin", DEFAULT_FOV_ARCMIN))
    if fov not in FOV_OPTIONS:
        raise ValueError(f"FOV inválido. Use um de: {', '.join(f'{v:g}' for v in FOV_OPTIONS)}.")
    sampling = str(payload.get("sampling", DEFAULT_SAMPLING))
    if sampling not in SAMPLING_OPTIONS:
        raise ValueError(f"Amostragem inválida. Use uma de: {', '.join(SAMPLING_OPTIONS)}.")
    render_profile = get_render_profile(
        str(payload.get("render_profile", DEFAULT_RENDER_PROFILE))
    ).name
    color_mode = str(payload.get("color_mode", "color"))
    if color_mode not in COLOR_MODES:
        raise ValueError(f"Modo de cor inválido. Use um de: {', '.join(COLOR_MODES)}.")
    return {
        "fov_arcmin": fov,
        "sampling": sampling,
        "render_profile": render_profile,
        "color_mode": color_mode,
    }


def settings_catalog() -> dict[str, Any]:
    return {
        "fov_options": [
            {
                "fov_arcmin": fov,
                "cutout_fov_arcmin": fov * CUTOUT_RATIO,
                "pixels": {
                    name: _grid_pixels(fov, scale) for name, scale in SAMPLING_OPTIONS.items()
                },
            }
            for fov in FOV_OPTIONS
        ],
        "sampling_options": [
            {"name": name, "pixel_scale_arcsec": scale}
            for name, scale in SAMPLING_OPTIONS.items()
        ],
        "render_profiles": [profile.to_dict() for profile in RENDER_PROFILES.values()],
        "color_modes": list(COLOR_MODES),
        "defaults": {
            "fov_arcmin": DEFAULT_FOV_ARCMIN,
            "sampling": DEFAULT_SAMPLING,
            "render_profile": DEFAULT_RENDER_PROFILE,
            "color_mode": "color",
        },
    }


def _grid_pixels(fov_arcmin: float, pixel_scale_arcsec: float) -> int:
    size = max(3, ceil(fov_arcmin * 60 / pixel_scale_arcsec))
    return size + 1 if size % 2 == 0 else size


@dataclass
class PrefetchJob:
    job_id: str
    request_id: str
    bandpass: str
    render_profile: str
    color_mode: str
    mode: str
    total: int
    started_at: float = field(default_factory=monotonic)
    status: str = "running"
    frames: dict[int, dict[str, Any]] = field(default_factory=dict)
    errors: dict[int, str] = field(default_factory=dict)
    finished_at: float | None = None
    lock: Lock = field(default_factory=Lock)

    def snapshot(self) -> dict[str, Any]:
        with self.lock:
            elapsed_until = self.finished_at or monotonic()
            return {
                "job_id": self.job_id,
                "request_id": self.request_id,
                "bandpass": self.bandpass,
                "render_profile": self.render_profile,
                "color_mode": self.color_mode,
                "mode": self.mode,
                "status": self.status,
                "total": self.total,
                "completed": len(self.frames),
                "failed": len(self.errors),
                "processed": len(self.frames) + len(self.errors),
                "cache_hits": sum(
                    1 for frame in self.frames.values() if frame["cache_hit"]
                ),
                "elapsed_ms": round((elapsed_until - self.started_at) * 1000, 1),
                "frames": [self.frames[index] for index in sorted(self.frames)],
                "errors": [
                    {"observation_index": index, "error": self.errors[index]}
                    for index in sorted(self.errors)
                ],
            }


class PrefetchJobManager:
    def __init__(self) -> None:
        self._jobs: dict[str, PrefetchJob] = {}
        self._lock = Lock()

    def start(
        self,
        service: SpherexTemporalSequenceService,
        dataset: Any,
        indices: list[int],
        mode: str,
        *,
        render_profile: str,
        color_mode: str,
    ) -> dict[str, Any]:
        key = (
            f"{dataset.request_id}:{mode}:{render_profile}-{color_mode}:"
            f"{','.join(map(str, indices))}"
        )
        job_id = sha256(key.encode("utf-8")).hexdigest()[:16]
        with self._lock:
            existing = self._jobs.get(job_id)
            if existing is not None and existing.status == "running":
                return existing.snapshot()
            job = PrefetchJob(
                job_id=job_id,
                request_id=dataset.request_id,
                bandpass=dataset.bandpass,
                render_profile=render_profile,
                color_mode=color_mode,
                mode=mode,
                total=len(indices),
            )
            self._jobs[job_id] = job
        Thread(
            target=self._run,
            args=(job, service, dataset, indices),
            name=f"spherex-prefetch-{job_id}",
            daemon=True,
        ).start()
        return job.snapshot()

    def get(self, job_id: str) -> dict[str, Any]:
        with self._lock:
            job = self._jobs.get(job_id)
        if job is None:
            raise FileNotFoundError(f"Pré-carregamento {job_id} não encontrado.")
        return job.snapshot()

    def is_running(self, request_id: str | None = None) -> bool:
        with self._lock:
            jobs = list(self._jobs.values())
        return any(
            job.status == "running"
            and (request_id is None or job.request_id == request_id)
            for job in jobs
        )

    def _run(
        self,
        job: PrefetchJob,
        service: SpherexTemporalSequenceService,
        dataset: Any,
        indices: list[int],
    ) -> None:
        def on_progress(index: int, result: Any, error: str | None) -> None:
            with job.lock:
                if result is not None:
                    job.frames[index] = {
                        "observation_index": index,
                        "observation_id": result.observation.observation_id,
                        "image_url": (
                            f"/cache/{job.request_id}/{result.relative_path}"
                            f"?v={FRAME_CACHE_VERSION}"
                        ),
                        "cache_hit": result.cache_hit,
                        "aligned": result.frame.aligned,
                        "center_ra_deg": result.frame.center_ra_deg,
                        "center_dec_deg": result.frame.center_dec_deg,
                        "coverage_fraction": result.frame.coverage_fraction,
                        "colorized": result.frame.colorized,
                        "wavelength_min_um": result.frame.wavelength_min_um,
                        "wavelength_max_um": result.frame.wavelength_max_um,
                        "wavelength_median_um": result.frame.wavelength_median_um,
                        "visible_wavelength_min_nm": (
                            result.frame.visible_wavelength_min_nm
                        ),
                        "visible_wavelength_max_nm": (
                            result.frame.visible_wavelength_max_nm
                        ),
                        "visible_wavelength_median_nm": (
                            result.frame.visible_wavelength_median_nm
                        ),
                        "false_color_rgb": result.frame.false_color_rgb,
                        "opacity": result.frame.opacity,
                        "render_profile": result.frame.render_profile,
                        "stretch": result.frame.stretch,
                        "background_mode": result.frame.background_mode,
                        "noise_sigma": result.frame.noise_sigma,
                        "width": result.frame.width,
                        "height": result.frame.height,
                    }
                else:
                    job.errors[index] = error or "Falha desconhecida."

        try:
            service.prefetch_frames(
                dataset=dataset,
                observation_indices=indices,
                output_directory=CACHE_ROOT,
                on_progress=on_progress,
                render_profile=job.render_profile,
                color_mode=job.color_mode,
            )
            with job.lock:
                job.status = "partial" if job.errors else "completed"
                job.finished_at = monotonic()
        except Exception as error:
            with job.lock:
                job.status = "failed"
                job.errors[-1] = str(error)
                job.finished_at = monotonic()


PREFETCH_JOBS = PrefetchJobManager()
SPECTRUM_SERVICE = SpherexSpectrumService(download_workers=8)
OUTPUTS = ("image", "spectrum")


def _cache_url(path: Path) -> str:
    relative = Path(path).resolve().relative_to(CACHE_ROOT.resolve())
    return f"/cache/{relative.as_posix()}"


SPECTRUM_JOBS = SpectrumJobManager(SPECTRUM_SERVICE, CACHE_ROOT, _cache_url)


class TemporalLabHandler(BaseHTTPRequestHandler):
    server_version = "SPHERExTemporalLab/0.1"

    def log_message(self, format: str, *args: Any) -> None:  # noqa: A002
        # Polling a cada ~0,5 s inundaria o log; erros continuam em log_error.
        return

    def do_GET(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        if path == "/api/health":
            self._send_json(
                {
                    "status": "ok",
                    "cache_directory": str(CACHE_ROOT),
                    "fov_arcmin": DEFAULT_SERVICE.fov_arcmin,
                    "cutout_fov_arcmin": DEFAULT_SERVICE.cutout_fov_arcmin,
                    "bands": [band.to_dict() for band in SPHEREX_BANDS],
                    "settings": settings_catalog(),
                }
            )
            return
        parts = path.strip("/").split("/")
        if len(parts) == 3 and parts[:2] == ["api", "spectra"]:
            try:
                self._send_json(SPECTRUM_JOBS.snapshot(parts[2]))
            except FileNotFoundError as error:
                self._send_error_json(HTTPStatus.NOT_FOUND, str(error))
            return
        if len(parts) == 3 and parts[:2] == ["api", "prefetch"]:
            try:
                self._send_json(PREFETCH_JOBS.get(parts[2]))
            except FileNotFoundError as error:
                self._send_error_json(HTTPStatus.NOT_FOUND, str(error))
            return
        if path.startswith("/cache/"):
            self._serve_cached_frame(path)
            return
        self._serve_public(path)

    def do_POST(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        try:
            if path == "/api/datasets":
                self._discover_dataset()
                return
            if path == "/api/composites":
                self._discover_composite()
                return
            parts = path.strip("/").split("/")
            if (
                len(parts) == 5
                and parts[0] == "api"
                and parts[1] == "datasets"
                and parts[3] == "frames"
            ):
                self._materialize_frame(parts[2], int(parts[4]))
                return
            self._send_error_json(HTTPStatus.NOT_FOUND, "Endpoint não encontrado.")
        except SequenceLimitExceeded as error:
            self._send_error_json(
                HTTPStatus.UNPROCESSABLE_ENTITY,
                str(error),
                {"found": error.found, "limit": error.limit},
            )
        except (ValueError, IndexError, json.JSONDecodeError) as error:
            self._send_error_json(HTTPStatus.BAD_REQUEST, str(error))
        except (FileNotFoundError, LookupError) as error:
            # LookupError: nenhuma observação cobre a coordenada nesta banda.
            self._send_error_json(HTTPStatus.NOT_FOUND, str(error))
        except Exception as error:  # laboratório: torna a falha observável
            self.log_error("Erro interno: %s", error)
            self._send_error_json(HTTPStatus.INTERNAL_SERVER_ERROR, str(error))

    def do_DELETE(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        try:
            # Só existe remoção por dataset: o cache completo é um acervo.
            parts = path.strip("/").split("/")
            if len(parts) == 3 and parts[:2] == ["api", "cache"]:
                if PREFETCH_JOBS.is_running(parts[2]):
                    self._send_error_json(
                        HTTPStatus.CONFLICT,
                        "Este dataset ainda está sendo pré-carregado.",
                    )
                    return
                removed = DEFAULT_SERVICE.clear_cache(CACHE_ROOT, parts[2])
                self._send_json(
                    {"removed": removed, "scope": "dataset", "request_id": parts[2]}
                )
                return
            self._send_error_json(HTTPStatus.NOT_FOUND, "Endpoint não encontrado.")
        except ValueError as error:
            self._send_error_json(HTTPStatus.BAD_REQUEST, str(error))

    def _discover_dataset(self) -> None:
        payload = self._read_json()
        ra_deg = float(payload["ra_deg"])
        dec_deg = float(payload["dec_deg"])
        mode = str(payload.get("mode", "balanced"))
        bandpass = str(payload.get("bandpass", "SPHEREx-D3"))
        settings = parse_render_settings(payload)
        service = service_for(bandpass, settings["fov_arcmin"], settings["sampling"])
        spectral_band = get_spherex_band(bandpass)
        refresh = bool(payload.get("refresh", False))
        started = monotonic()
        dataset = service.discover_dataset(
            ra_deg=ra_deg,
            dec_deg=dec_deg,
            output_directory=CACHE_ROOT,
            use_cache=not refresh,
        )
        selected_indices = service.select_indices(dataset, mode)
        prefetch = PREFETCH_JOBS.start(
            service,
            dataset,
            selected_indices,
            mode,
            render_profile=settings["render_profile"],
            color_mode=settings["color_mode"],
        )
        frames = []
        previous_time: datetime | None = None
        for position, observation_index in enumerate(selected_indices):
            observation = dataset.observations[observation_index]
            observed_at = datetime.fromisoformat(observation.observed_at or "")
            gap = None
            if previous_time is not None:
                gap = (observed_at - previous_time).total_seconds()
            previous_time = observed_at
            frames.append(
                {
                    "position": position,
                    "observation_index": observation_index,
                    "observation_id": observation.observation_id,
                    "observed_at": observation.observed_at,
                    "observation_end": observation.observation_end,
                    "gap_from_previous_seconds": gap,
                    "bandpass": observation.bandpass,
                }
            )

        self._send_json(
            {
                "request_id": dataset.request_id,
                "ra_deg": dataset.ra_deg,
                "dec_deg": dataset.dec_deg,
                "fov_arcmin": dataset.fov_arcmin,
                "cutout_fov_arcmin": dataset.cutout_fov_arcmin,
                "bandpass": dataset.bandpass,
                "spectral_band": spectral_band.to_dict(),
                **settings,
                "aligned": True,
                "mode": mode,
                "cache_hit": dataset.cache_hit,
                "available_frame_count": dataset.frame_count,
                "selected_frame_count": len(frames),
                "source_observation_count": dataset.source_observation_count,
                "band_observation_count": dataset.band_observation_count,
                "discovery_ms": round((monotonic() - started) * 1000, 1),
                "prefetch": prefetch,
                "frames": frames,
            }
        )

    def _discover_composite(self) -> None:
        payload = self._read_json()
        ra_deg = float(payload["ra_deg"])
        dec_deg = float(payload["dec_deg"])
        mode = str(payload.get("mode", "fast"))
        refresh = bool(payload.get("refresh", False))
        requested = payload.get("bandpasses")
        if not isinstance(requested, list) or not requested:
            raise ValueError("Selecione pelo menos uma banda espectral.")
        requested_names = [str(value) for value in requested]
        if len(set(requested_names)) != len(requested_names):
            raise ValueError("A seleção contém bandas repetidas.")
        if len(requested_names) > len(SPHEREX_BANDS):
            raise ValueError("A seleção excede as seis bandas SPHEREx.")
        bandpasses = [get_spherex_band(name).bandpass for name in requested_names]
        output = str(payload.get("output", "image"))
        if output not in OUTPUTS:
            raise ValueError(f"Saída inválida. Use uma de: {', '.join(OUTPUTS)}.")
        if output == "spectrum":
            # Espectro usa todas as observações e recortes pequenos próprios;
            # FOV, amostragem e renderização de imagem não se aplicam.
            theme = str(payload.get("theme", "dark"))
            job = SPECTRUM_JOBS.start(ra_deg, dec_deg, bandpasses, theme)
            self._send_json(
                {
                    "output": "spectrum",
                    "ra_deg": ra_deg,
                    "dec_deg": dec_deg,
                    "bandpasses": bandpasses,
                    "bands": [get_spherex_band(name).to_dict() for name in bandpasses],
                    "job": job,
                }
            )
            return
        settings = parse_render_settings(payload)
        started = monotonic()

        def band_service(bandpass: str) -> SpherexTemporalSequenceService:
            return service_for(bandpass, settings["fov_arcmin"], settings["sampling"])

        def discover(bandpass: str) -> tuple[str, Any]:
            service = band_service(bandpass)
            dataset = service.discover_dataset(
                ra_deg=ra_deg,
                dec_deg=dec_deg,
                output_directory=CACHE_ROOT,
                use_cache=not refresh,
            )
            return bandpass, dataset

        with ThreadPoolExecutor(max_workers=len(bandpasses)) as executor:
            discovered = executor.map(discover, bandpasses)
        datasets = dict(discovered)

        anchor_bandpass = bandpasses[0]
        anchor_dataset = datasets[anchor_bandpass]
        anchor_service = band_service(anchor_bandpass)
        anchor_indices = anchor_service.select_indices(anchor_dataset, mode)
        selected_by_band: dict[str, set[int]] = {
            bandpass: set() for bandpass in bandpasses
        }
        timeline = []
        for position, anchor_index in enumerate(anchor_indices):
            anchor_observation = anchor_dataset.observations[anchor_index]
            anchor_time = _observation_time(anchor_observation)
            layers = []
            for bandpass in bandpasses:
                dataset = datasets[bandpass]
                if bandpass == anchor_bandpass:
                    observation_index = anchor_index
                else:
                    observation_index = min(
                        range(dataset.frame_count),
                        key=lambda index: abs(
                            (
                                _observation_time(dataset.observations[index])
                                - anchor_time
                            ).total_seconds()
                        ),
                    )
                selected_by_band[bandpass].add(observation_index)
                observation = dataset.observations[observation_index]
                delta_seconds = (
                    _observation_time(observation) - anchor_time
                ).total_seconds()
                layers.append(
                    {
                        "bandpass": bandpass,
                        "dataset_request_id": dataset.request_id,
                        "observation_index": observation_index,
                        "observation_id": observation.observation_id,
                        "observed_at": observation.observed_at,
                        "delta_seconds": delta_seconds,
                    }
                )
            timeline.append(
                {
                    "position": position,
                    "anchor_bandpass": anchor_bandpass,
                    "anchor_observation_id": anchor_observation.observation_id,
                    "observed_at": anchor_observation.observed_at,
                    "gap_from_previous_seconds": _timeline_gap(
                        timeline,
                        anchor_time,
                    ),
                    "layers": layers,
                }
            )

        jobs = {}
        dataset_summaries = []
        for bandpass in bandpasses:
            service = band_service(bandpass)
            dataset = datasets[bandpass]
            indices = sorted(selected_by_band[bandpass])
            jobs[bandpass] = PREFETCH_JOBS.start(
                service,
                dataset,
                indices,
                mode,
                render_profile=settings["render_profile"],
                color_mode=settings["color_mode"],
            )
            dataset_summaries.append(
                {
                    "bandpass": bandpass,
                    "request_id": dataset.request_id,
                    "cache_hit": dataset.cache_hit,
                    "available_frame_count": dataset.frame_count,
                    "selected_frame_count": len(indices),
                }
            )

        composite_key = ":".join(
            [
                "image",
                mode,
                settings["render_profile"],
                settings["color_mode"],
                *(datasets[name].request_id for name in bandpasses),
            ]
        )
        self._send_json(
            {
                "output": "image",
                "request_id": sha256(composite_key.encode("utf-8")).hexdigest()[:16],
                "ra_deg": ra_deg,
                "dec_deg": dec_deg,
                "fov_arcmin": anchor_dataset.fov_arcmin,
                "cutout_fov_arcmin": anchor_dataset.cutout_fov_arcmin,
                "pixel_scale_arcsec": anchor_dataset.pixel_scale_arcsec,
                "grid_pixels": _grid_pixels(
                    anchor_dataset.fov_arcmin, anchor_dataset.pixel_scale_arcsec
                ),
                **settings,
                "bandpasses": bandpasses,
                "bands": [get_spherex_band(name).to_dict() for name in bandpasses],
                "anchor_bandpass": anchor_bandpass,
                "aligned": True,
                "mode": mode,
                "timeline_count": len(timeline),
                "discovery_ms": round((monotonic() - started) * 1000, 1),
                "datasets": dataset_summaries,
                "prefetch": jobs,
                "frames": timeline,
            }
        )

    def _materialize_frame(self, request_id: str, observation_index: int) -> None:
        started = monotonic()
        dataset = DEFAULT_SERVICE.load_dataset(CACHE_ROOT, request_id)
        service = service_for_dataset(dataset)
        query = parse_qs(urlparse(self.path).query)
        settings = parse_render_settings(
            {
                "fov_arcmin": dataset.fov_arcmin,
                "render_profile": query.get("profile", [DEFAULT_RENDER_PROFILE])[0],
                "color_mode": query.get("color", ["color"])[0],
            }
        )
        result = service.materialize_frame(
            dataset=dataset,
            observation_index=observation_index,
            output_directory=CACHE_ROOT,
            render_profile=settings["render_profile"],
            color_mode=settings["color_mode"],
        )
        data = result.to_dict()
        data["image_url"] = (
            f"/cache/{request_id}/{result.relative_path}?v={FRAME_CACHE_VERSION}"
        )
        data["elapsed_ms"] = round((monotonic() - started) * 1000, 1)
        self._send_json(data)

    def _serve_cached_frame(self, url_path: str) -> None:
        parts = url_path.strip("/").split("/", maxsplit=2)
        if len(parts) != 3:
            self._send_error_json(HTTPStatus.NOT_FOUND, "Frame não encontrado.")
            return
        _, request_id, relative = parts
        try:
            dataset_directory = DEFAULT_SERVICE._cache_target(CACHE_ROOT, request_id)
        except ValueError as error:
            self._send_error_json(HTTPStatus.BAD_REQUEST, str(error))
            return
        target = (dataset_directory / unquote(relative)).resolve()
        if (
            not target.is_relative_to(dataset_directory)
            or target.suffix.lower() not in {".webp", ".svg"}
            or not target.is_file()
        ):
            self._send_error_json(HTTPStatus.NOT_FOUND, "Frame não encontrado.")
            return
        self._send_file(target, cache_control="public, max-age=31536000, immutable")

    def _serve_public(self, url_path: str) -> None:
        relative = "index.html" if url_path == "/" else unquote(url_path.lstrip("/"))
        target = (PUBLIC_ROOT / relative).resolve()
        if not target.is_relative_to(PUBLIC_ROOT) or not target.is_file():
            self._send_error_json(HTTPStatus.NOT_FOUND, "Arquivo não encontrado.")
            return
        self._send_file(target, cache_control="no-cache")

    def _send_file(self, path: Path, *, cache_control: str) -> None:
        content = path.read_bytes()
        content_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(content)))
        self.send_header("Cache-Control", cache_control)
        self.end_headers()
        self.wfile.write(content)

    def _read_json(self) -> dict[str, Any]:
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0 or length > 64 * 1024:
            raise ValueError("Corpo JSON ausente ou muito grande.")
        return json.loads(self.rfile.read(length).decode("utf-8"))

    def _send_json(self, data: dict[str, Any], status: HTTPStatus = HTTPStatus.OK) -> None:
        content = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(content)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(content)

    def _send_error_json(
        self,
        status: HTTPStatus,
        message: str,
        details: dict[str, Any] | None = None,
    ) -> None:
        self._send_json(
            {"error": message, "details": details or {}},
            status=status,
        )


def _observation_time(observation: Any) -> datetime:
    if not observation.observed_at:
        raise ValueError("Observação sem data não pode compor a linha temporal.")
    return datetime.fromisoformat(observation.observed_at)


def _timeline_gap(timeline: list[dict[str, Any]], current: datetime) -> float | None:
    if not timeline:
        return None
    previous = datetime.fromisoformat(str(timeline[-1]["observed_at"]))
    return (current - previous).total_seconds()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8801)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    CACHE_ROOT.mkdir(parents=True, exist_ok=True)
    Thread(
        target=lambda: print(
            f"Calibrações WCS-WAVE aprendidas do cache: {SPECTRUM_SERVICE.seed_calibrations(CACHE_ROOT)}",
            flush=True,
        ),
        name="spherex-seed-calibrations",
        daemon=True,
    ).start()
    server = ThreadingHTTPServer((args.host, args.port), TemporalLabHandler)
    print(f"Motor SPHEREx: http://{args.host}:{args.port} · cache {CACHE_ROOT}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nEncerrando laboratório.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
