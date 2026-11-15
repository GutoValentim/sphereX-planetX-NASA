"""Execução assíncrona dos espectros, compartilhada pelo FastAPI e pelo laboratório.

Uma coordenada nova leva dezenas de segundos (uma medição por observação),
então a requisição inicia um job e o cliente consulta o progresso.
"""

from __future__ import annotations

from collections import OrderedDict
from hashlib import sha256
import json
from pathlib import Path
from threading import Lock, Thread
from time import monotonic
from typing import Any, Callable, Sequence

from app.services.spectrum_service import SpectrumResult, SpherexSpectrumService


UrlBuilder = Callable[[Path], str]
MAX_JOBS = 200


class SpectrumJobManager:
    """Jobs em memória (um processo), com deduplicação por coordenada/bandas/tema."""

    def __init__(
        self,
        service: SpherexSpectrumService,
        output_directory: Path,
        url_for: UrlBuilder,
    ) -> None:
        self.service = service
        self.output_directory = output_directory
        self.url_for = url_for
        self._jobs: OrderedDict[str, dict[str, Any]] = OrderedDict()
        self._lock = Lock()

    def start(
        self, ra_deg: float, dec_deg: float, bandpasses: Sequence[str], theme: str
    ) -> dict[str, Any]:
        bands = list(bandpasses)
        key = json.dumps([round(ra_deg, 9), round(dec_deg, 9), sorted(bands), theme])
        job_id = sha256(key.encode("utf-8")).hexdigest()[:16]
        with self._lock:
            existing = self._jobs.get(job_id)
            if existing is not None and existing["status"] == "running":
                return self._snapshot(existing)
            job = {
                "job_id": job_id,
                "status": "running",
                "started_at": monotonic(),
                "finished_at": None,
                "progress": {name: {"done": 0, "total": None} for name in bands},
                "result": None,
                "error": None,
            }
            self._jobs[job_id] = job
            self._jobs.move_to_end(job_id)
            while len(self._jobs) > MAX_JOBS:
                oldest = next(iter(self._jobs))
                if self._jobs[oldest]["status"] == "running":
                    break
                self._jobs.popitem(last=False)
        Thread(
            target=self._run,
            args=(job_id, ra_deg, dec_deg, bands, theme),
            name=f"spherex-spectrum-{job_id}",
            daemon=True,
        ).start()
        return self.snapshot(job_id)

    def snapshot(self, job_id: str) -> dict[str, Any]:
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                raise FileNotFoundError(f"Espectro {job_id} não encontrado.")
            return self._snapshot(job)

    def is_running(self) -> bool:
        with self._lock:
            return any(job["status"] == "running" for job in self._jobs.values())

    @staticmethod
    def _snapshot(job: dict[str, Any]) -> dict[str, Any]:
        elapsed = (job["finished_at"] or monotonic()) - job["started_at"]
        data = {key: value for key, value in job.items() if key not in {"started_at", "finished_at"}}
        data["progress"] = {name: dict(value) for name, value in job["progress"].items()}
        data["elapsed_ms"] = round(elapsed * 1000, 1)
        return data

    def _run(
        self, job_id: str, ra_deg: float, dec_deg: float, bandpasses: list[str], theme: str
    ) -> None:
        def on_progress(bandpass: str, done: int, total: int) -> None:
            with self._lock:
                self._jobs[job_id]["progress"][bandpass] = {"done": done, "total": total}

        try:
            result = self.service.spectrum(
                ra_deg=ra_deg,
                dec_deg=dec_deg,
                bandpasses=bandpasses,
                output_directory=self.output_directory,
                theme=theme,
                on_progress=on_progress,
            )
            summary = summarize(result, self.url_for)
            with self._lock:
                self._jobs[job_id].update(status="completed", result=summary)
        except Exception as error:  # o cliente vê a falha no próprio job
            with self._lock:
                self._jobs[job_id].update(status="failed", error=str(error))
        finally:
            with self._lock:
                self._jobs[job_id]["finished_at"] = monotonic()


def summarize(result: SpectrumResult, url_for: UrlBuilder) -> dict[str, Any]:
    """Resposta serializável: URLs dos gráficos e os pontos medidos por banda."""

    return {
        "ra_deg": result.ra_deg,
        "dec_deg": result.dec_deg,
        "combined_chart_url": url_for(Path(result.combined_chart)),
        "bands": [
            {
                "bandpass": band.bandpass,
                "band": band.band,
                "chart_url": url_for(Path(result.band_charts[band.bandpass]))
                if band.bandpass in result.band_charts
                else None,
                "observation_count": band.observation_count,
                "measured_count": len(band.points),
                "rejected": band.rejected,
                "failed": band.failed,
                "outliers": list(band.outliers),
                "error": band.error,
                "points": [point.to_dict() for point in band.points],
            }
            for band in result.bands
        ],
    }
