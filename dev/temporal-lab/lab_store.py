"""Persistência do laboratório: motores versionados, registros, cobertura e exportação.

Estrutura do diretório de dados (``SPHEREX_LAB_DATA_DIR``)::

    engines/<id>/engine.json      título, descrição, SHA e hash do código congelado
    engines/<id>/code/            cópia de backend/app e engine_server.py
    engines/<id>/cache/           cache científico gerado por esta versão
    records/<id>.json             alvo nomeado (RA/Dec, nome, descrição, mapeamentos)
    exports/<engine>/index.json   catálogo pronto para o produto
    exports/<engine>/<slug>/      manifesto + frames WebP + SVGs (hardlinks do cache)

Nada aqui importa o backend científico: a cobertura é lida dos arquivos que o
motor grava (``dataset.json``, ``frame-cache.json``, ``spectrum/…``).
"""

from __future__ import annotations

from datetime import datetime, timezone
from hashlib import sha256
import json
import os
from pathlib import Path
import re
import shutil
import tempfile
from threading import RLock
from typing import Any, Iterable
import unicodedata


BANDS = tuple(f"SPHEREx-D{index}" for index in range(1, 7))
SPECTRUM_FOV_ARCMIN = 3.0
NATIVE_PIXEL_SCALE_ARCSEC = 6.15
SAMPLING_SCALES = {"native": NATIVE_PIXEL_SCALE_ARCSEC, "2x": NATIVE_PIXEL_SCALE_ARCSEC / 2}
DEFAULT_ANCHOR = "SPHEREx-D3"
THEMES = ("dark", "light")
_ENGINE_ID = re.compile(r"v[1-9][0-9]{0,3}")
_RECORD_ID = re.compile(r"[0-9a-f]{12}")
_DATASET_ID = re.compile(r"[0-9a-f]{16}")


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def write_json(path: Path, data: Any) -> None:
    """Gravação atômica: um leitor nunca vê um JSON pela metade."""

    path.parent.mkdir(parents=True, exist_ok=True)
    handle, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(handle, "w", encoding="utf-8") as stream:
            json.dump(data, stream, ensure_ascii=False, indent=2)
        os.replace(temporary, path)
    except BaseException:
        Path(temporary).unlink(missing_ok=True)
        raise


def read_json(path: Path, default: Any = None) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return default


def slugify(value: str) -> str:
    text = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return slug[:60] or "alvo"


def coordinate_key(ra_deg: float, dec_deg: float) -> tuple[float, float]:
    return (round(float(ra_deg), 7), round(float(dec_deg), 7))


def sampling_name(pixel_scale_arcsec: float) -> str:
    for name, scale in SAMPLING_SCALES.items():
        if abs(scale - pixel_scale_arcsec) < 1e-6:
            return name
    return f"{pixel_scale_arcsec:g}arcsec"


def config_key(fov_arcmin: float, sampling: str) -> str:
    return f"{float(fov_arcmin):g}-{sampling}"


# ---------------------------------------------------------------- motores


def engine_code_files(source_root: Path) -> list[Path]:
    """Arquivos que definem o comportamento do motor (relativos à raiz do repo)."""

    backend = sorted(
        path.relative_to(source_root)
        for path in (source_root / "backend" / "app").rglob("*.py")
        if "__pycache__" not in path.parts
    )
    return [*backend, Path("dev/temporal-lab/engine_server.py")]


def engine_code_hash(source_root: Path) -> str:
    digest = sha256()
    for relative in engine_code_files(source_root):
        digest.update(relative.as_posix().encode("utf-8") + b"\0")
        digest.update((source_root / relative).read_bytes() + b"\0")
    return digest.hexdigest()[:12]


class EngineRegistry:
    """Versões congeladas do motor. Uma versão criada nunca muda de código."""

    def __init__(self, data_root: Path, source_root: Path, release_sha: str | None) -> None:
        self.root = data_root / "engines"
        self.source_root = source_root
        self.release_sha = release_sha
        self.current_hash = engine_code_hash(source_root)
        self._lock = RLock()

    def list(self) -> list[dict[str, Any]]:
        engines = []
        if self.root.is_dir():
            for directory in self.root.iterdir():
                meta = read_json(directory / "engine.json")
                if meta and _ENGINE_ID.fullmatch(directory.name):
                    meta["is_current_code"] = meta.get("code_hash") == self.current_hash
                    engines.append(meta)
        return sorted(engines, key=lambda item: int(item["id"][1:]))

    def get(self, engine_id: str) -> dict[str, Any]:
        if not _ENGINE_ID.fullmatch(engine_id or ""):
            raise ValueError("Versão de motor inválida.")
        meta = read_json(self.root / engine_id / "engine.json")
        if meta is None:
            raise FileNotFoundError(f"Motor {engine_id} não encontrado.")
        meta["is_current_code"] = meta.get("code_hash") == self.current_hash
        return meta

    def default_id(self) -> str:
        engines = self.list()
        if not engines:
            raise FileNotFoundError("Nenhum motor criado.")
        return engines[-1]["id"]

    def code_dir(self, engine_id: str) -> Path:
        self.get(engine_id)
        return self.root / engine_id / "code"

    def cache_dir(self, engine_id: str) -> Path:
        self.get(engine_id)
        return self.root / engine_id / "cache"

    def has_current_code(self) -> bool:
        return any(engine.get("code_hash") == self.current_hash for engine in self.list())

    def ensure_initial(self, legacy_cache: Path | None = None) -> None:
        with self._lock:
            if self.list():
                return
            meta = self.create(
                "Motor inicial",
                "Primeira versão publicada do laboratório: sequências alinhadas por WCS, "
                "cinco perfis de renderização, falsa cor por WCS-WAVE e espectro por "
                "fotometria forçada multi-época.",
            )
            cache = self.root / meta["id"] / "cache"
            if legacy_cache is not None and legacy_cache.is_dir() and not cache.exists():
                cache.symlink_to(legacy_cache.resolve(), target_is_directory=True)

    def create(self, title: str, description: str = "") -> dict[str, Any]:
        title = title.strip()
        if not title:
            raise ValueError("Informe um título para a versão.")
        with self._lock:
            engines = self.list()
            same = next((e for e in engines if e.get("code_hash") == self.current_hash), None)
            if same is not None:
                raise ValueError(
                    f"O código atual já está congelado como {same['id']} ({same['title']})."
                )
            number = max((int(engine["id"][1:]) for engine in engines), default=0) + 1
            engine_id = f"v{number}"
            self.root.mkdir(parents=True, exist_ok=True)
            staging = Path(tempfile.mkdtemp(prefix=f".{engine_id}-", dir=self.root))
            staging.chmod(0o755)
            try:
                for relative in engine_code_files(self.source_root):
                    target = staging / "code" / relative
                    target.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(self.source_root / relative, target)
                meta = {
                    "id": engine_id,
                    "title": title[:120],
                    "description": description.strip()[:2000],
                    "code_hash": self.current_hash,
                    "git_sha": self.release_sha,
                    "created_at": now_iso(),
                    "updated_at": now_iso(),
                }
                write_json(staging / "engine.json", meta)
                staging.rename(self.root / engine_id)
            except BaseException:
                shutil.rmtree(staging, ignore_errors=True)
                raise
            meta["is_current_code"] = True
            return meta

    def update(self, engine_id: str, *, title: str | None, description: str | None) -> dict[str, Any]:
        with self._lock:
            meta = self.get(engine_id)
            meta.pop("is_current_code", None)
            if title is not None:
                if not title.strip():
                    raise ValueError("O título não pode ficar vazio.")
                meta["title"] = title.strip()[:120]
            if description is not None:
                meta["description"] = description.strip()[:2000]
            meta["updated_at"] = now_iso()
            write_json(self.root / engine_id / "engine.json", meta)
            return self.get(engine_id)


# --------------------------------------------------------------- registros


def record_id_for(ra_deg: float, dec_deg: float) -> str:
    ra, dec = coordinate_key(ra_deg, dec_deg)
    return sha256(f"{ra:.7f}:{dec:.7f}".encode("utf-8")).hexdigest()[:12]


def validate_coordinates(ra_deg: Any, dec_deg: Any) -> tuple[float, float]:
    try:
        ra, dec = float(ra_deg), float(dec_deg)
    except (TypeError, ValueError) as error:
        raise ValueError("RA e Dec devem ser números em graus.") from error
    if not (0 <= ra < 360):
        raise ValueError("RA deve estar entre 0 e 360 graus.")
    if not (-90 <= dec <= 90):
        raise ValueError("Dec deve estar entre −90 e +90 graus.")
    return ra, dec


class RecordStore:
    """Alvos nomeados, compartilhados por todos que usam o laboratório."""

    def __init__(self, data_root: Path) -> None:
        self.root = data_root / "records"
        self._lock = RLock()

    def _path(self, record_id: str) -> Path:
        if not _RECORD_ID.fullmatch(record_id or ""):
            raise ValueError("Registro inválido.")
        return self.root / f"{record_id}.json"

    def list(self) -> list[dict[str, Any]]:
        if not self.root.is_dir():
            return []
        records = [read_json(path) for path in self.root.glob("*.json")]
        records = [record for record in records if record]
        return sorted(records, key=lambda item: item.get("updated_at", ""), reverse=True)

    def get(self, record_id: str) -> dict[str, Any]:
        record = read_json(self._path(record_id))
        if record is None:
            raise FileNotFoundError("Registro não encontrado.")
        return record

    def upsert(
        self,
        ra_deg: Any,
        dec_deg: Any,
        *,
        name: str | None = None,
        description: str | None = None,
        query: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        ra, dec = validate_coordinates(ra_deg, dec_deg)
        record_id = record_id_for(ra, dec)
        with self._lock:
            path = self._path(record_id)
            record = read_json(path) or {
                "id": record_id,
                "name": "",
                "description": "",
                "ra_deg": ra,
                "dec_deg": dec,
                "created_at": now_iso(),
                "mapping": {},
            }
            if name is not None and name.strip():
                record["name"] = name.strip()[:160]
            if description is not None and description.strip():
                record["description"] = description.strip()[:4000]
            if query is not None:
                record["last_query"] = query
            record["updated_at"] = now_iso()
            write_json(path, record)
            return record

    def update(self, record_id: str, *, name: str | None, description: str | None) -> dict[str, Any]:
        with self._lock:
            record = self.get(record_id)
            if name is not None:
                record["name"] = name.strip()[:160]
            if description is not None:
                record["description"] = description.strip()[:4000]
            record["updated_at"] = now_iso()
            write_json(self._path(record_id), record)
            return record

    def set_mapping(self, record_id: str, engine_id: str, state: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            record = self.get(record_id)
            record.setdefault("mapping", {})[engine_id] = state
            write_json(self._path(record_id), record)
            return record

    def clear_mapping(self, record_id: str, engine_id: str) -> dict[str, Any]:
        with self._lock:
            record = self.get(record_id)
            record.setdefault("mapping", {}).pop(engine_id, None)
            write_json(self._path(record_id), record)
            return record

    def delete(self, record_id: str) -> bool:
        with self._lock:
            path = self._path(record_id)
            if not path.exists():
                return False
            path.unlink()
            return True


# ---------------------------------------------------------------- cobertura


class CacheIndex:
    """Lê o que um motor já gravou, agrupado por coordenada.

    Os resumos por diretório ficam em memória e só são relidos quando o
    ``mtime`` dos arquivos de estado muda.
    """

    def __init__(self, cache_root: Path) -> None:
        self.cache_root = cache_root
        self._memo: dict[str, tuple[tuple[float, ...], dict[str, Any] | None]] = {}
        self._lock = RLock()

    def scan(self) -> dict[tuple[float, float], dict[str, Any]]:
        by_coordinate: dict[tuple[float, float], dict[str, Any]] = {}
        if not self.cache_root.is_dir():
            return by_coordinate
        with self._lock:
            seen = set()
            for directory in self.cache_root.iterdir():
                if not _DATASET_ID.fullmatch(directory.name):
                    continue
                seen.add(directory.name)
                summary = self._summary(directory)
                if summary is None:
                    continue
                entry = by_coordinate.setdefault(
                    coordinate_key(summary["ra_deg"], summary["dec_deg"]),
                    {"images": [], "spectra": {}, "composites": [], "dataset_ids": []},
                )
                entry["dataset_ids"].append(directory.name)
                if summary["kind"] == "image":
                    entry["images"].append(summary)
                elif summary["kind"] == "spectrum":
                    entry["spectra"][summary["bandpass"]] = summary
                else:
                    entry["composites"].append(summary)
            for stale in set(self._memo) - seen:
                self._memo.pop(stale, None)
        return by_coordinate

    def _summary(self, directory: Path) -> dict[str, Any] | None:
        dataset_path = directory / "dataset.json"
        frames_path = directory / "frame-cache.json"
        photometry_path = directory / "spectrum" / "photometry.json"
        composite_path = directory / "spectrum" / "composite.json"
        stamp = tuple(
            path.stat().st_mtime if path.exists() else 0.0
            for path in (dataset_path, frames_path, photometry_path, composite_path, directory / "spectrum")
        )
        cached = self._memo.get(directory.name)
        if cached is not None and cached[0] == stamp:
            return cached[1]
        summary = _summarize_directory(directory)
        self._memo[directory.name] = (stamp, summary)
        return summary


def _summarize_directory(directory: Path) -> dict[str, Any] | None:
    dataset = read_json(directory / "dataset.json")
    if dataset is None:
        composite = read_json(directory / "spectrum" / "composite.json")
        if composite is None:
            return None
        charts = {
            theme: sorted(p.name for p in (directory / "spectrum").glob(f"combined-{theme}-*.svg"))
            for theme in THEMES
        }
        return {
            "kind": "composite",
            "id": directory.name,
            "ra_deg": composite["ra_deg"],
            "dec_deg": composite["dec_deg"],
            "bandpasses": composite.get("bandpasses", []),
            "charts": {theme: names[-1] for theme, names in charts.items() if names},
        }

    observations = dataset.get("observations", [])
    base = {
        "id": directory.name,
        "ra_deg": dataset["ra_deg"],
        "dec_deg": dataset["dec_deg"],
        "bandpass": dataset["bandpass"],
        "total": len(observations),
    }
    if abs(float(dataset.get("fov_arcmin", 0)) - SPECTRUM_FOV_ARCMIN) < 1e-9:
        photometry = read_json(directory / "spectrum" / "photometry.json", {}) or {}
        charts = {
            theme: sorted(p.name for p in (directory / "spectrum").glob(f"band-{theme}-*.svg"))
            for theme in THEMES
        }
        return {
            **base,
            "kind": "spectrum",
            "measured": len(photometry.get("points", {})),
            "rejected": len(photometry.get("rejected", {})),
            "charts": {theme: names[-1] for theme, names in charts.items() if names},
        }

    state = read_json(directory / "frame-cache.json", {}) or {}
    variants = {
        name: len(variant.get("frames", {}))
        for name, variant in (state.get("variants") or {}).items()
    }
    fits_directory = directory / "fits"
    fits = (
        sum(1 for path in fits_directory.iterdir() if ".fits" in path.name and not path.name.endswith(".part"))
        if fits_directory.is_dir()
        else 0
    )
    return {
        **base,
        "kind": "image",
        "fov_arcmin": float(dataset["fov_arcmin"]),
        "sampling": sampling_name(float(dataset.get("pixel_scale_arcsec", NATIVE_PIXEL_SCALE_ARCSEC))),
        "fits": min(fits, len(observations)),
        "variants": variants,
    }


def _percent(done: float, total: float) -> float:
    if total <= 0:
        return 0.0
    return round(min(100.0, 100.0 * done / total), 1)


def compute_coverage(
    record: dict[str, Any],
    entry: dict[str, Any] | None,
    engine_id: str,
    variants: Iterable[str],
) -> dict[str, Any]:
    """Quanto do alvo já está guardado neste motor, por FOV, banda e espectro."""

    variants = list(variants)
    entry = entry or {"images": [], "spectra": {}, "composites": []}
    mapping = (record.get("mapping") or {}).get(engine_id) or {}
    plan = mapping.get("plan") or {}
    unavailable = mapping.get("unavailable") or {}
    errors = mapping.get("errors") or []
    error_bands = {item.get("bandpass") for item in errors if isinstance(item, dict)}

    datasets_by_config: dict[str, dict[str, dict[str, Any]]] = {}
    for dataset in entry["images"]:
        key = config_key(dataset["fov_arcmin"], dataset["sampling"])
        datasets_by_config.setdefault(key, {})[dataset["bandpass"]] = dataset

    planned_configs = [
        config_key(item["fov_arcmin"], item["sampling"]) for item in plan.get("configs", [])
    ]
    config_names = list(dict.fromkeys([*planned_configs, *sorted(datasets_by_config)]))
    configs = []
    for key in config_names:
        fov_text, sampling = key.split("-", 1)
        found = datasets_by_config.get(key, {})
        skip = set(unavailable.get(f"images:{key}", []))
        planned = key in planned_configs
        wanted = set(plan.get("bands") or []) if planned else set()
        expected = [b for b in BANDS if (b in wanted or b in found) and b not in skip]
        bands = {}
        for bandpass in expected:
            dataset = found.get(bandpass)
            if dataset is None:
                bands[bandpass] = {
                    "status": "error" if bandpass in error_bands else "missing",
                    "percent": 0.0,
                    "fits_percent": 0.0,
                }
                continue
            total = dataset["total"]
            rendered = sum(min(dataset["variants"].get(name, 0), total) for name in variants)
            percent = _percent(rendered, total * len(variants))
            fits_percent = _percent(dataset["fits"], total)
            status = "complete" if percent >= 100 and fits_percent >= 100 else "partial"
            if status != "complete" and bandpass in error_bands:
                status = "error"
            bands[bandpass] = {
                "status": status,
                "percent": percent,
                "fits_percent": fits_percent,
                "total": total,
                "fits": dataset["fits"],
                "rendered": rendered,
                "variants_complete": sum(
                    1 for name in variants if dataset["variants"].get(name, 0) >= total > 0
                ),
            }
        for bandpass in sorted(skip, key=BANDS.index):
            bands[bandpass] = {"status": "unavailable", "percent": None, "fits_percent": None}
        measured = [band for band in bands.values() if band["percent"] is not None]
        in_plan = [bands[b] for b in bands if b in wanted and bands[b]["percent"] is not None]
        configs.append(
            {
                "key": key,
                "planned": planned,
                "fov_arcmin": float(fov_text),
                "sampling": sampling,
                "percent": round(sum(b["percent"] for b in measured) / len(measured), 1) if measured else 0.0,
                "fits_percent": round(sum(b["fits_percent"] for b in measured) / len(measured), 1) if measured else 0.0,
                # Só as bandas pedidas no plano: é o que define o "100% mapeado".
                "plan_percent": round(sum(b["percent"] for b in in_plan) / len(in_plan), 1) if in_plan else None,
                "bands": bands,
            }
        )

    spectra = entry["spectra"]
    spectrum_skip = set(unavailable.get("spectrum", []))
    wanted_spectrum = set(plan.get("bands") or []) if plan.get("spectrum") else set()
    expected_spectrum = [
        b for b in BANDS if (b in wanted_spectrum or b in spectra) and b not in spectrum_skip
    ]
    spectrum_bands = {}
    for bandpass in expected_spectrum:
        dataset = spectra.get(bandpass)
        if dataset is None:
            spectrum_bands[bandpass] = {
                "status": "error" if bandpass in error_bands else "missing",
                "percent": 0.0,
            }
            continue
        done = dataset["measured"] + dataset["rejected"]
        percent = _percent(done, dataset["total"])
        if not dataset["charts"]:
            percent = min(percent, 99.0)  # medições completas, gráfico ainda não gerado
        complete = percent >= 100
        status = "complete" if complete else ("error" if bandpass in error_bands else "partial")
        spectrum_bands[bandpass] = {
            "status": status,
            "percent": percent,
            "total": dataset["total"],
            "measured": dataset["measured"],
            "rejected": dataset["rejected"],
            "themes": sorted(dataset["charts"]),
        }
    for bandpass in sorted(spectrum_skip, key=BANDS.index):
        spectrum_bands[bandpass] = {"status": "unavailable", "percent": None}
    spectrum_measured = [b for b in spectrum_bands.values() if b["percent"] is not None]
    spectrum_in_plan = [
        spectrum_bands[b] for b in spectrum_bands
        if b in wanted_spectrum and spectrum_bands[b]["percent"] is not None
    ]
    spectrum_percent = (
        round(sum(b["percent"] for b in spectrum_measured) / len(spectrum_measured), 1)
        if spectrum_measured
        else None
    )

    # Com plano de mapeamento, o estado geral mede o que foi pedido; explorações
    # avulsas em outros FOVs aparecem nos badges, mas não impedem o "100%".
    basis = "plan" if plan else "cache"
    if basis == "plan":
        pieces = [c["plan_percent"] for c in configs if c["planned"] and c["plan_percent"] is not None]
        if plan.get("spectrum") and spectrum_in_plan:
            pieces.append(round(sum(b["percent"] for b in spectrum_in_plan) / len(spectrum_in_plan), 1))
    else:
        pieces = [c["percent"] for c in configs]
        if spectrum_percent is not None:
            pieces.append(spectrum_percent)
    overall = round(sum(pieces) / len(pieces), 1) if pieces else 0.0
    mapping_status = mapping.get("status")
    if mapping_status in {"queued", "running"}:
        status = mapping_status
    elif not pieces:
        status = "empty"
    elif overall >= 100:
        status = "complete"
    elif errors or mapping_status in {"error", "partial"}:
        status = "error"
    else:
        status = "partial"
    return {
        "engine_id": engine_id,
        "status": status,
        "percent": overall,
        "basis": basis,
        "images": {
            "percent": round(sum(c["percent"] for c in configs) / len(configs), 1) if configs else None,
            "configs": configs,
            "variants": variants,
        },
        "spectrum": {"percent": spectrum_percent, "bands": spectrum_bands},
    }


# ---------------------------------------------------------------- exportação


def _link(source: Path, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists():
        return
    try:
        os.link(source, target)
    except OSError:  # outro sistema de arquivos: copia
        shutil.copy2(source, target)


def _pair_epochs(datasets: dict[str, dict[str, Any]], anchor: str) -> list[dict[str, Any]]:
    """Mesmo pareamento do produto (sequence_jobs): época mais próxima por banda."""

    def when(observation: dict[str, Any]) -> datetime:
        return datetime.fromisoformat(observation["observed_at"])

    frames = []
    for anchor_index, anchor_observation in enumerate(datasets[anchor]["observations"]):
        anchor_time = when(anchor_observation)
        layers = []
        for bandpass, dataset in datasets.items():
            observations = dataset["observations"]
            index = anchor_index if bandpass == anchor else min(
                range(len(observations)),
                key=lambda i: abs((when(observations[i]) - anchor_time).total_seconds()),
            )
            observation = observations[index]
            layers.append(
                {
                    "bandpass": bandpass,
                    "observation_index": index,
                    "observation_id": observation["observation_id"],
                    "observed_at": observation["observed_at"],
                    "delta_seconds": (when(observation) - anchor_time).total_seconds(),
                }
            )
        frames.append(
            {
                "id": anchor_observation["observation_id"],
                "observed_at": anchor_observation["observed_at"],
                "anchor_bandpass": anchor,
                "layers": layers,
            }
        )
    return frames


def export_record(
    record: dict[str, Any],
    engine: dict[str, Any],
    cache_root: Path,
    entry: dict[str, Any] | None,
    spectrum_results: dict[str, dict[str, Any]],
    export_root: Path,
) -> dict[str, Any]:
    """Grava ``exports/<motor>/<slug>/manifest.json`` e os arquivos referenciados.

    Os caminhos no manifesto são relativos à pasta do alvo, então a pasta pode
    ser copiada para o produto e servida como estática. Os formatos de
    ``frames`` e ``spectrum`` seguem ``/api/sequencias`` e ``/api/espectros``.
    """

    entry = entry or {"images": [], "spectra": {}, "composites": []}
    slug = f"{slugify(record.get('name') or 'alvo')}-{record['id'][:6]}"
    engine_root = export_root / engine["id"]
    staging = Path(tempfile.mkdtemp(prefix=f".{slug}-", dir=_ensure(engine_root)))
    staging.chmod(0o755)
    sequences: list[dict[str, Any]] = []
    try:
        grouped: dict[str, dict[str, dict[str, Any]]] = {}
        for dataset in entry["images"]:
            grouped.setdefault(config_key(dataset["fov_arcmin"], dataset["sampling"]), {})[
                dataset["bandpass"]
            ] = dataset
        for key, by_band in sorted(grouped.items()):
            datasets = {}
            states = {}
            for bandpass in sorted(by_band, key=BANDS.index):
                directory = cache_root / by_band[bandpass]["id"]
                datasets[bandpass] = read_json(directory / "dataset.json")
                states[bandpass] = read_json(directory / "frame-cache.json", {}) or {}
            variant_names = sorted({name for state in states.values() for name in (state.get("variants") or {})})
            for variant in variant_names:
                def source_for(bandpass: str, observation_id: str) -> tuple[Path | None, dict[str, Any]]:
                    cached = (
                        ((states[bandpass].get("variants") or {}).get(variant) or {})
                        .get("frames", {})
                        .get(observation_id)
                    )
                    if not cached:
                        return None, {}
                    source = cache_root / by_band[bandpass]["id"] / cached["relative_path"]
                    return (source if source.is_file() else None), cached

                # Só entram bandas com todas as épocas renderizadas nesta variante:
                # o produto nunca recebe uma camada vazia.
                ready = [
                    bandpass for bandpass, dataset in datasets.items()
                    if dataset["observations"] and all(
                        source_for(bandpass, item["observation_id"])[0] is not None
                        for item in dataset["observations"]
                    )
                ]
                if not ready:
                    continue
                anchor = DEFAULT_ANCHOR if DEFAULT_ANCHOR in ready else ready[0]
                frames = _pair_epochs({band: datasets[band] for band in ready}, anchor)
                for frame in frames:
                    for layer in frame["layers"]:
                        bandpass = layer["bandpass"]
                        source, cached = source_for(bandpass, layer["observation_id"])
                        relative = f"frames/{key}/{variant}/{bandpass.replace('SPHEREx-', '')}/{source.name}"
                        _link(source, staging / relative)
                        generated = cached.get("frame", {})
                        layer.update(
                            image_url=relative,
                            error=None,
                            width=generated.get("width"),
                            height=generated.get("height"),
                            colorized=generated.get("colorized"),
                            false_color_rgb=generated.get("false_color_rgb"),
                            wavelength_min_um=generated.get("wavelength_min_um"),
                            wavelength_max_um=generated.get("wavelength_max_um"),
                            coverage_fraction=generated.get("coverage_fraction"),
                        )
                profile, color = variant.rsplit("-", 1)
                sequences.append(
                    {
                        "key": f"{key}/{variant}",
                        "fov_arcmin": by_band[anchor]["fov_arcmin"],
                        "sampling": by_band[anchor]["sampling"],
                        "pixel_scale_arcsec": SAMPLING_SCALES.get(by_band[anchor]["sampling"]),
                        "render_profile": profile,
                        "color_mode": color,
                        "anchor_bandpass": anchor,
                        "bandpasses": ready,
                        "omitted_bandpasses": [band for band in datasets if band not in ready],
                        "frames": frames,
                    }
                )

        spectrum: dict[str, Any] = {}
        for theme, summary in spectrum_results.items():
            if not summary:
                continue
            result = json.loads(json.dumps(summary))

            def relink(url: str | None, name: str) -> str | None:
                if not url:
                    return None
                source = cache_root / url.split("/cache/", 1)[-1].split("?", 1)[0]
                if not source.is_file():
                    return None
                relative = f"spectrum/{theme}/{name}.svg"
                _link(source, staging / relative)
                return relative

            result["combined_chart_url"] = relink(result.get("combined_chart_url"), "combined")
            for band in result.get("bands", []):
                band["chart_url"] = relink(band.get("chart_url"), band["bandpass"].replace("SPHEREx-", ""))
            spectrum[theme] = result

        manifest = {
            "schema": "spherex-lab-target/1",
            "id": record["id"],
            "slug": slug,
            "name": record.get("name") or "",
            "description": record.get("description") or "",
            "ra_deg": record["ra_deg"],
            "dec_deg": record["dec_deg"],
            "engine": {k: engine.get(k) for k in ("id", "title", "git_sha", "code_hash")},
            "exported_at": now_iso(),
            "sequences": sequences,
            "spectrum": spectrum,
        }
        write_json(staging / "manifest.json", manifest)
        final = engine_root / slug
        for old in engine_root.glob(f"*-{record['id'][:6]}"):
            if old.is_dir() and old != staging:
                shutil.rmtree(old)
        staging.rename(final)
    except BaseException:
        shutil.rmtree(staging, ignore_errors=True)
        raise
    write_export_index(engine_root)
    return {"slug": slug, "path": f"{engine['id']}/{slug}", "sequences": len(sequences), "spectrum_themes": sorted(spectrum)}


def write_export_index(engine_root: Path) -> None:
    targets = []
    for manifest_path in sorted(engine_root.glob("*/manifest.json")):
        manifest = read_json(manifest_path)
        if not manifest:
            continue
        targets.append(
            {
                "id": manifest["id"],
                "slug": manifest["slug"],
                "name": manifest["name"],
                "description": manifest["description"],
                "ra_deg": manifest["ra_deg"],
                "dec_deg": manifest["dec_deg"],
                "manifest": f"{manifest['slug']}/manifest.json",
                "sequences": [item["key"] for item in manifest["sequences"]],
                "spectrum_themes": sorted(manifest["spectrum"]),
                "exported_at": manifest["exported_at"],
            }
        )
    write_json(engine_root / "index.json", {"schema": "spherex-lab-index/1", "targets": targets})


def _ensure(path: Path) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    return path
