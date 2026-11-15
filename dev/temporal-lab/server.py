#!/usr/bin/env python3
"""Servidor local do laboratório de sequências temporais SPHEREx."""

from __future__ import annotations

import argparse
from dataclasses import dataclass, field
from datetime import datetime
from hashlib import sha256
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import mimetypes
from pathlib import Path
import sys
from threading import Lock, Thread
from time import monotonic
from typing import Any
from urllib.parse import unquote, urlparse


LAB_ROOT = Path(__file__).resolve().parent
PROJECT_ROOT = LAB_ROOT.parents[1]
EXTERNAL_DEV_ROOT = PROJECT_ROOT.parent / "dev"
PUBLIC_ROOT = LAB_ROOT / "public"
CACHE_ROOT = EXTERNAL_DEV_ROOT / "results" / "temporal-lab-cache"
sys.path.insert(0, str(PROJECT_ROOT / "backend"))

from app.services.temporal_sequence_service import (  # noqa: E402
    SequenceLimitExceeded,
    SpherexTemporalSequenceService,
)


SERVICE = SpherexTemporalSequenceService(download_workers=8)


@dataclass
class PrefetchJob:
    job_id: str
    request_id: str
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

    def start(self, dataset: Any, indices: list[int], mode: str) -> dict[str, Any]:
        key = f"{dataset.request_id}:{mode}:{','.join(map(str, indices))}"
        job_id = sha256(key.encode("utf-8")).hexdigest()[:16]
        with self._lock:
            existing = self._jobs.get(job_id)
            if existing is not None and existing.status == "running":
                return existing.snapshot()
            job = PrefetchJob(
                job_id=job_id,
                request_id=dataset.request_id,
                mode=mode,
                total=len(indices),
            )
            self._jobs[job_id] = job
        Thread(
            target=self._run,
            args=(job, dataset, indices),
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

    def _run(self, job: PrefetchJob, dataset: Any, indices: list[int]) -> None:
        def on_progress(index: int, result: Any, error: str | None) -> None:
            with job.lock:
                if result is not None:
                    job.frames[index] = {
                        "observation_index": index,
                        "observation_id": result.observation.observation_id,
                        "image_url": (
                            f"/cache/{job.request_id}/{result.relative_path}"
                        ),
                        "cache_hit": result.cache_hit,
                        "aligned": result.frame.aligned,
                        "center_ra_deg": result.frame.center_ra_deg,
                        "center_dec_deg": result.frame.center_dec_deg,
                        "coverage_fraction": result.frame.coverage_fraction,
                    }
                else:
                    job.errors[index] = error or "Falha desconhecida."

        try:
            SERVICE.prefetch_frames(
                dataset=dataset,
                observation_indices=indices,
                output_directory=CACHE_ROOT,
                on_progress=on_progress,
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


class TemporalLabHandler(BaseHTTPRequestHandler):
    server_version = "SPHERExTemporalLab/0.1"

    def end_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        super().end_headers()

    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(HTTPStatus.NO_CONTENT)
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        if path == "/api/health":
            self._send_json(
                {
                    "status": "ok",
                    "cache_directory": str(CACHE_ROOT),
                    "fov_arcmin": SERVICE.fov_arcmin,
                    "cutout_fov_arcmin": SERVICE.cutout_fov_arcmin,
                    "bandpass": SERVICE.bandpass,
                }
            )
            return
        parts = path.strip("/").split("/")
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
        except FileNotFoundError as error:
            self._send_error_json(HTTPStatus.NOT_FOUND, str(error))
        except Exception as error:  # laboratório local: torna a falha observável
            self.log_error("Erro interno: %s", error)
            self._send_error_json(HTTPStatus.INTERNAL_SERVER_ERROR, str(error))

    def do_DELETE(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        try:
            if path == "/api/cache":
                if PREFETCH_JOBS.is_running():
                    self._send_error_json(
                        HTTPStatus.CONFLICT,
                        "Aguarde o pré-carregamento atual terminar antes de limpar o cache.",
                    )
                    return
                removed = SERVICE.clear_cache(CACHE_ROOT)
                self._send_json({"removed": removed, "scope": "all"})
                return
            parts = path.strip("/").split("/")
            if len(parts) == 3 and parts[:2] == ["api", "cache"]:
                if PREFETCH_JOBS.is_running(parts[2]):
                    self._send_error_json(
                        HTTPStatus.CONFLICT,
                        "Este dataset ainda está sendo pré-carregado.",
                    )
                    return
                removed = SERVICE.clear_cache(CACHE_ROOT, parts[2])
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
        refresh = bool(payload.get("refresh", False))
        started = monotonic()
        dataset = SERVICE.discover_dataset(
            ra_deg=ra_deg,
            dec_deg=dec_deg,
            output_directory=CACHE_ROOT,
            use_cache=not refresh,
        )
        selected_indices = SERVICE.select_indices(dataset, mode)
        prefetch = PREFETCH_JOBS.start(dataset, selected_indices, mode)
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

    def _materialize_frame(self, request_id: str, observation_index: int) -> None:
        started = monotonic()
        dataset = SERVICE.load_dataset(CACHE_ROOT, request_id)
        result = SERVICE.materialize_frame(
            dataset=dataset,
            observation_index=observation_index,
            output_directory=CACHE_ROOT,
        )
        data = result.to_dict()
        data["image_url"] = f"/cache/{request_id}/{result.relative_path}"
        data["elapsed_ms"] = round((monotonic() - started) * 1000, 1)
        self._send_json(data)

    def _serve_cached_frame(self, url_path: str) -> None:
        parts = url_path.strip("/").split("/", maxsplit=2)
        if len(parts) != 3:
            self._send_error_json(HTTPStatus.NOT_FOUND, "Frame não encontrado.")
            return
        _, request_id, relative = parts
        try:
            dataset_directory = SERVICE._cache_target(CACHE_ROOT, request_id)
        except ValueError as error:
            self._send_error_json(HTTPStatus.BAD_REQUEST, str(error))
            return
        target = (dataset_directory / unquote(relative)).resolve()
        if (
            not target.is_relative_to(dataset_directory)
            or target.suffix.lower() != ".webp"
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


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    CACHE_ROOT.mkdir(parents=True, exist_ok=True)
    server = ThreadingHTTPServer((args.host, args.port), TemporalLabHandler)
    print(f"SPHEREx Temporal Lab: http://{args.host}:{args.port}")
    print(f"Cache: {CACHE_ROOT}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nEncerrando laboratório.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
