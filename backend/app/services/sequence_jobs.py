"""Sequência temporal multibanda para o frontend, gerada em segundo plano.

1. Descobre as observações de cada banda (só metadados).
2. Escolhe as épocas pela banda de referência e associa, em cada outra banda,
   a observação mais próxima no tempo.
3. Renderiza os frames alinhados (banda de referência primeiro) e publica a URL
   de cada camada assim que fica pronta, para o cliente mostrar progressivamente.
"""

from __future__ import annotations

from collections import OrderedDict
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from hashlib import sha256
import json
from pathlib import Path
from threading import Lock, Thread
from time import monotonic
from typing import Any, Callable, Sequence

from app.services.spectral_color import get_spherex_band
from app.services.temporal_sequence_service import (
    SpherexTemporalSequenceService,
    TemporalDataset,
)


UrlBuilder = Callable[[Path], str]
ServiceFactory = Callable[[str], SpherexTemporalSequenceService]
MAX_JOBS = 200


class SequenceJobManager:
    def __init__(self, service_for: ServiceFactory, output_directory: Path, url_for: UrlBuilder) -> None:
        self.service_for = service_for
        self.output_directory = output_directory
        self.url_for = url_for
        self._jobs: OrderedDict[str, dict[str, Any]] = OrderedDict()
        self._lock = Lock()

    def start(
        self,
        *,
        ra_deg: float,
        dec_deg: float,
        bandpasses: Sequence[str],
        anchor_bandpass: str,
        mode: str,
        render_profile: str,
        color_mode: str,
    ) -> dict[str, Any]:
        bands = list(dict.fromkeys(bandpasses))
        if anchor_bandpass not in bands:
            bands.insert(0, anchor_bandpass)
        settings = {
            "mode": mode,
            "render_profile": render_profile,
            "color_mode": color_mode,
            "anchor_bandpass": anchor_bandpass,
        }
        key = json.dumps([round(ra_deg, 9), round(dec_deg, 9), sorted(bands), settings], sort_keys=True)
        job_id = sha256(key.encode("utf-8")).hexdigest()[:16]
        with self._lock:
            existing = self._jobs.get(job_id)
            if existing is not None and existing["status"] in {"discovering", "rendering"}:
                return self._snapshot(existing)
            self._jobs[job_id] = {
                "job_id": job_id,
                "status": "discovering",
                "started_at": monotonic(),
                "finished_at": None,
                "ra_deg": ra_deg,
                "dec_deg": dec_deg,
                "bandpasses": bands,
                **settings,
                "bands": {},
                "frames": [],
                "progress": {"done": 0, "total": 0},
                "error": None,
            }
            self._jobs.move_to_end(job_id)
            while len(self._jobs) > MAX_JOBS:
                oldest = next(iter(self._jobs))
                if self._jobs[oldest]["status"] in {"discovering", "rendering"}:
                    break
                self._jobs.popitem(last=False)
        Thread(target=self._run, args=(job_id,), name=f"spherex-sequence-{job_id}", daemon=True).start()
        return self.snapshot(job_id)

    def snapshot(self, job_id: str) -> dict[str, Any]:
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                raise FileNotFoundError(f"Sequência {job_id} não encontrada.")
            return self._snapshot(job)

    @staticmethod
    def _snapshot(job: dict[str, Any]) -> dict[str, Any]:
        elapsed = (job["finished_at"] or monotonic()) - job["started_at"]
        data = json.loads(json.dumps({k: v for k, v in job.items() if k not in {"started_at", "finished_at"}}))
        data["elapsed_ms"] = round(elapsed * 1000, 1)
        return data

    def _update(self, job_id: str, **changes: Any) -> None:
        with self._lock:
            self._jobs[job_id].update(changes)

    def _run(self, job_id: str) -> None:
        with self._lock:
            job = self._jobs[job_id]
            ra_deg, dec_deg = job["ra_deg"], job["dec_deg"]
            bands, anchor = list(job["bandpasses"]), job["anchor_bandpass"]
            mode, profile, color = job["mode"], job["render_profile"], job["color_mode"]
        root = self.output_directory
        try:
            datasets, band_info = self._discover(ra_deg, dec_deg, bands)
            available = [band for band in bands if band in datasets]
            if not available:
                raise LookupError("Nenhuma banda tem observações que cubram esta coordenada.")
            if anchor not in datasets:
                anchor = available[0]
            anchor_service = self.service_for(anchor)
            anchor_indices = anchor_service.select_indices(datasets[anchor], mode)
            frames, selected = _pair_epochs(datasets, available, anchor, anchor_indices)
            total = sum(len(indices) for indices in selected.values())
            self._update(
                job_id,
                status="rendering",
                anchor_bandpass=anchor,
                bands=band_info,
                frames=frames,
                progress={"done": 0, "total": total},
            )

            def on_progress(bandpass: str, dataset: TemporalDataset, *, retry: bool = False):
                def callback(index: int, result: Any, error: str | None) -> None:
                    with self._lock:
                        current = self._jobs[job_id]
                        if not retry:
                            current["progress"]["done"] += 1
                        for frame in current["frames"]:
                            for layer in frame["layers"]:
                                if layer["bandpass"] != bandpass or layer["observation_index"] != index:
                                    continue
                                if result is None:
                                    layer["error"] = error or "Falha ao gerar o frame."
                                    continue
                                generated = result.frame
                                layer.update(
                                    error=None,
                                    image_url=self.url_for(
                                        root / dataset.request_id / result.relative_path
                                    ),
                                    width=generated.width,
                                    height=generated.height,
                                    colorized=generated.colorized,
                                    false_color_rgb=generated.false_color_rgb,
                                    wavelength_min_um=generated.wavelength_min_um,
                                    wavelength_max_um=generated.wavelength_max_um,
                                    coverage_fraction=generated.coverage_fraction,
                                )
                return callback

            # Banda de referência primeiro: a primeira imagem aparece o quanto antes.
            for bandpass in [anchor, *[band for band in available if band != anchor]]:
                dataset = datasets[bandpass]
                self.service_for(bandpass).prefetch_frames(
                    dataset=dataset,
                    observation_indices=sorted(selected[bandpass]),
                    output_directory=root,
                    on_progress=on_progress(bandpass, dataset),
                    render_profile=profile,
                    color_mode=color,
                )
            # Falhas costumam ser transitórias (rede/IRSA): uma nova tentativa por camada.
            for bandpass in available:
                with self._lock:
                    failed = sorted({
                        layer["observation_index"]
                        for frame in self._jobs[job_id]["frames"]
                        for layer in frame["layers"]
                        if layer["bandpass"] == bandpass and layer.get("error")
                    })
                if failed:
                    dataset = datasets[bandpass]
                    self.service_for(bandpass).prefetch_frames(
                        dataset=dataset,
                        observation_indices=failed,
                        output_directory=root,
                        on_progress=on_progress(bandpass, dataset, retry=True),
                        render_profile=profile,
                        color_mode=color,
                    )
            with self._lock:
                current = self._jobs[job_id]
                failed = any(layer.get("error") for frame in current["frames"] for layer in frame["layers"])
                current["status"] = "partial" if failed else "completed"
        except Exception as error:  # o cliente vê a falha no próprio job
            self._update(job_id, status="failed", error=str(error))
        finally:
            self._update(job_id, finished_at=monotonic())

    def _discover(
        self, ra_deg: float, dec_deg: float, bands: list[str]
    ) -> tuple[dict[str, TemporalDataset], dict[str, dict[str, Any]]]:
        def discover(bandpass: str) -> tuple[str, TemporalDataset | None, str | None]:
            try:
                dataset = self.service_for(bandpass).discover_dataset(
                    ra_deg=ra_deg, dec_deg=dec_deg, output_directory=self.output_directory
                )
                return bandpass, dataset, None
            except (LookupError, ValueError) as error:
                return bandpass, None, str(error)

        with ThreadPoolExecutor(max_workers=len(bands)) as executor:
            results = list(executor.map(discover, bands))
        datasets = {band: dataset for band, dataset, _ in results if dataset is not None}
        info = {
            band: {
                "band": get_spherex_band(band).to_dict(),
                "available": dataset is not None,
                "observation_count": dataset.frame_count if dataset else 0,
                "error": error,
            }
            for band, dataset, error in results
        }
        return datasets, info


def _pair_epochs(
    datasets: dict[str, TemporalDataset],
    bands: list[str],
    anchor: str,
    anchor_indices: list[int],
) -> tuple[list[dict[str, Any]], dict[str, set[int]]]:
    selected: dict[str, set[int]] = {band: set() for band in bands}
    frames = []
    for anchor_index in anchor_indices:
        anchor_observation = datasets[anchor].observations[anchor_index]
        anchor_time = _time(anchor_observation.observed_at)
        layers = []
        for band in bands:
            dataset = datasets[band]
            if band == anchor:
                index = anchor_index
            else:
                index = min(
                    range(dataset.frame_count),
                    key=lambda i: abs((_time(dataset.observations[i].observed_at) - anchor_time).total_seconds()),
                )
            selected[band].add(index)
            observation = dataset.observations[index]
            layers.append(
                {
                    "bandpass": band,
                    "observation_index": index,
                    "observation_id": observation.observation_id,
                    "observed_at": observation.observed_at,
                    "delta_seconds": (_time(observation.observed_at) - anchor_time).total_seconds(),
                    "image_url": None,
                    "error": None,
                }
            )
        frames.append(
            {
                "id": anchor_observation.observation_id,
                "observed_at": anchor_observation.observed_at,
                "anchor_bandpass": anchor,
                "layers": layers,
            }
        )
    return frames, selected


def _time(value: str | None) -> datetime:
    if not value:
        raise ValueError("Observação sem data não pode compor a sequência.")
    return datetime.fromisoformat(value)
