#!/usr/bin/env python3
"""Gateway do laboratório SPHEREx: interface, registros, versões do motor e mapeamento.

Cada versão do motor (``engine_server.py`` + ``backend/app`` congelados) roda em
um subprocesso próprio em 127.0.0.1, com cache próprio. Este processo serve a
interface, guarda os registros nomeados, calcula a cobertura a partir do disco,
executa a fila de mapeamento e grava as exportações para o produto.
"""

from __future__ import annotations

import argparse
import base64
from collections import deque
from hashlib import pbkdf2_hmac
import hmac
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import mimetypes
import os
from pathlib import Path
import secrets
import shutil
import subprocess
import sys
from threading import Condition, Lock, Thread
import time
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, unquote, urlparse
from urllib.request import Request, urlopen

import lab_store
from lab_store import (
    BANDS,
    CacheIndex,
    EngineRegistry,
    RecordStore,
    compute_coverage,
    coordinate_key,
    export_record,
    now_iso,
    read_json,
    write_json,
)


LAB_ROOT = Path(__file__).resolve().parent
PROJECT_ROOT = LAB_ROOT.parents[1]
PUBLIC_ROOT = LAB_ROOT / "public"
DATA_ROOT = Path(
    os.environ.get(
        "SPHEREX_LAB_DATA_DIR",
        PROJECT_ROOT.parent / "dev" / "results" / "temporal-lab-data",
    )
).expanduser()
LEGACY_CACHE = os.environ.get("SPHEREX_LAB_CACHE_DIR")
ENGINE_BASE_PORT = int(os.environ.get("SPHEREX_LAB_ENGINE_BASE_PORT", "8800"))
# Apagar registros ou caches perde horas de download do IRSA: desativado, salvo liberação explícita.
ALLOW_DELETE = os.environ.get("SPHEREX_LAB_ALLOW_DELETE") == "1"
DELETE_DISABLED = "Apagar dados está desativado no laboratório para não perder mapeamentos."
FOV_OPTIONS = (10.0, 15.0, 20.0, 30.0, 40.0)
SAMPLINGS = ("native", "2x")
THEMES = ("dark", "light")
# Falhas do IRSA (502/503) costumam ser transitórias: espera crescente entre tentativas.
RETRY_DELAYS = (5, 20, 60)


def release_sha() -> str | None:
    path = os.environ.get("SPHEREX_RELEASE_ENV")
    if path and Path(path).is_file():
        for line in Path(path).read_text(encoding="utf-8").splitlines():
            if line.startswith("GIT_SHA="):
                return line.split("=", 1)[1].strip()
    try:
        return subprocess.run(
            ["git", "-C", str(PROJECT_ROOT), "rev-parse", "HEAD"],
            capture_output=True, text=True, timeout=5, check=True,
        ).stdout.strip()
    except (OSError, subprocess.SubprocessError):
        return None


VERSION = release_sha()


# -------------------------------------------------------------- autenticação


class BasicAuth:
    """Usuário/senha gerados no primeiro start e guardados no diretório de dados."""

    def __init__(self, data_root: Path, required: bool) -> None:
        self.required = required
        self._accepted: set[str] = set()
        self._lock = Lock()
        self.config: dict[str, Any] | None = None
        if not required:
            return
        path = data_root / "auth.json"
        self.config = read_json(path)
        if self.config is None:
            password = secrets.token_urlsafe(18)
            salt = secrets.token_hex(16)
            self.config = {
                "username": "spherex",
                "salt": salt,
                "iterations": 200_000,
                "hash": pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), 200_000).hex(),
            }
            write_json(path, self.config)
            path.chmod(0o600)
            credentials = data_root / "CREDENTIALS.txt"
            credentials.write_text(
                "SPHEREx Lab — acesso HTTP Basic\n"
                f"usuário: {self.config['username']}\nsenha: {password}\n"
                "Para trocar: apague auth.json e CREDENTIALS.txt e reinicie o container.\n",
                encoding="utf-8",
            )
            credentials.chmod(0o600)
            print(f"Credenciais do laboratório criadas em {credentials}", flush=True)

    def check(self, header: str | None) -> bool:
        if not self.required:
            return True
        if not header or not header.startswith("Basic "):
            return False
        with self._lock:
            if header in self._accepted:
                return True
        try:
            username, password = base64.b64decode(header[6:]).decode("utf-8").split(":", 1)
        except (ValueError, UnicodeDecodeError):
            return False
        config = self.config or {}
        digest = pbkdf2_hmac(
            "sha256", password.encode(), bytes.fromhex(config["salt"]), int(config["iterations"])
        ).hex()
        valid = hmac.compare_digest(username, config["username"]) and hmac.compare_digest(
            digest, config["hash"]
        )
        if valid:
            with self._lock:
                self._accepted.add(header)
        return valid


# ------------------------------------------------------------------ motores


class EngineWorker:
    def __init__(self, engine_id: str, code_dir: Path, cache_dir: Path) -> None:
        self.engine_id = engine_id
        self.code_dir = code_dir
        self.cache_dir = cache_dir
        self.port = ENGINE_BASE_PORT + int(engine_id[1:])
        self.process: subprocess.Popen[bytes] | None = None
        self.catalog: dict[str, Any] | None = None
        self._lock = Lock()

    def ensure(self) -> None:
        with self._lock:
            if self.process is not None and self.process.poll() is None:
                return
            self.cache_dir.mkdir(parents=True, exist_ok=True)
            env = {
                **os.environ,
                "SPHEREX_LAB_CACHE_DIR": str(self.cache_dir),
                "PYTHONUNBUFFERED": "1",
            }
            env.pop("PYTHONPATH", None)
            script = self.code_dir / "dev" / "temporal-lab" / "engine_server.py"
            self.process = subprocess.Popen(
                [sys.executable, str(script), "--host", "127.0.0.1", "--port", str(self.port)],
                cwd=str(script.parent),
                env=env,
            )
            deadline = time.monotonic() + 180
            while time.monotonic() < deadline:
                if self.process.poll() is not None:
                    raise RuntimeError(f"O motor {self.engine_id} encerrou ao iniciar.")
                status, data = self._call("GET", "/api/health", None, 3)
                if status == 200:
                    self.catalog = data.get("settings")
                    return
                time.sleep(0.5)
            raise RuntimeError(f"O motor {self.engine_id} não respondeu a tempo.")

    def variants(self) -> list[str]:
        self.ensure()
        catalog = self.catalog or {}
        profiles = [item["name"] for item in catalog.get("render_profiles", [])]
        return [f"{profile}-{color}" for profile in profiles for color in catalog.get("color_modes", [])]

    def call(self, method: str, path: str, payload: Any = None, timeout: float = 60) -> tuple[int, dict[str, Any]]:
        self.ensure()
        return self._call(method, path, payload, timeout)

    def raw(self, method: str, path: str, body: bytes | None, timeout: float = 300) -> tuple[int, bytes]:
        self.ensure()
        request = Request(
            f"http://127.0.0.1:{self.port}{path}",
            data=body,
            method=method,
            headers={"Content-Type": "application/json"},
        )
        try:
            with urlopen(request, timeout=timeout) as response:
                return response.status, response.read()
        except HTTPError as error:
            return error.code, error.read()
        except (URLError, OSError) as error:
            message = json.dumps({"error": f"Motor {self.engine_id} indisponível: {error}"})
            return 502, message.encode("utf-8")

    def _call(self, method: str, path: str, payload: Any, timeout: float) -> tuple[int, dict[str, Any]]:
        body = json.dumps(payload).encode("utf-8") if payload is not None else None
        request = Request(
            f"http://127.0.0.1:{self.port}{path}",
            data=body,
            method=method,
            headers={"Content-Type": "application/json"},
        )
        try:
            with urlopen(request, timeout=timeout) as response:
                return response.status, json.loads(response.read() or b"{}")
        except HTTPError as error:
            try:
                return error.code, json.loads(error.read() or b"{}")
            except json.JSONDecodeError:
                return error.code, {"error": f"HTTP {error.code}"}
        except (URLError, OSError, json.JSONDecodeError) as error:
            return 0, {"error": str(error)}

    def stop(self) -> None:
        if self.process is not None and self.process.poll() is None:
            self.process.terminate()


class EngineManager:
    def __init__(self, registry: EngineRegistry) -> None:
        self.registry = registry
        self._workers: dict[str, EngineWorker] = {}
        self._indexes: dict[str, CacheIndex] = {}
        self._lock = Lock()

    def worker(self, engine_id: str) -> EngineWorker:
        with self._lock:
            worker = self._workers.get(engine_id)
            if worker is None:
                worker = EngineWorker(
                    engine_id, self.registry.code_dir(engine_id), self.registry.cache_dir(engine_id)
                )
                self._workers[engine_id] = worker
            return worker

    def index(self, engine_id: str) -> CacheIndex:
        with self._lock:
            index = self._indexes.get(engine_id)
            if index is None:
                index = CacheIndex(self.registry.cache_dir(engine_id))
                self._indexes[engine_id] = index
            return index

    def stop(self) -> None:
        for worker in self._workers.values():
            worker.stop()


# ------------------------------------------------------------- mapeamento


def validate_plan(payload: dict[str, Any]) -> dict[str, Any]:
    bands = [str(value) for value in payload.get("bands") or BANDS]
    if not bands or any(band not in BANDS for band in bands):
        raise ValueError("Bandas inválidas.")
    configs = []
    for item in payload.get("configs") or []:
        fov = float(item.get("fov_arcmin"))
        sampling = str(item.get("sampling", "native"))
        if fov not in FOV_OPTIONS or sampling not in SAMPLINGS:
            raise ValueError("Configuração de FOV/amostragem inválida.")
        configs.append({"fov_arcmin": fov, "sampling": sampling})
    configs = [dict(item) for item in {(c["fov_arcmin"], c["sampling"]): c for c in configs}.values()]
    spectrum = bool(payload.get("spectrum", True))
    if not configs and not spectrum:
        raise ValueError("Escolha pelo menos um FOV ou o espectro.")
    return {
        "bands": sorted(dict.fromkeys(bands), key=BANDS.index),
        "configs": configs,
        "spectrum": spectrum,
    }


class Cancelled(Exception):
    pass


class MappingQueue:
    """Mapeia alvos inteiros no servidor, um por vez, sem depender da aba aberta."""

    def __init__(self, records: RecordStore, engines: EngineManager) -> None:
        self.records = records
        self.engines = engines
        self._queue: deque[tuple[str, str]] = deque()
        self._current: tuple[str, str] | None = None
        self._cancelled: set[tuple[str, str]] = set()
        self._condition = Condition()
        Thread(target=self._loop, name="spherex-lab-mapping", daemon=True).start()

    def recover(self) -> None:
        """Após reinício/deploy, retoma o que estava na fila ou em execução."""

        for record in sorted(self.records.list(), key=lambda item: item.get("updated_at", "")):
            for engine_id, state in (record.get("mapping") or {}).items():
                if state.get("status") in {"queued", "running"}:
                    state["status"] = "queued"
                    state["progress"] = {**state.get("progress", {}), "label": "Retomado após reinício"}
                    self.records.set_mapping(record["id"], engine_id, state)
                    with self._condition:
                        self._queue.append((record["id"], engine_id))
                        self._condition.notify()

    def enqueue(self, record_id: str, engine_id: str, plan: dict[str, Any]) -> dict[str, Any]:
        key = (record_id, engine_id)
        with self._condition:
            if key == self._current or key in self._queue:
                raise ValueError("Este registro já está na fila de mapeamento deste motor.")
            self._cancelled.discard(key)
            total = len(plan["configs"]) * len(plan["bands"]) + (1 if plan["spectrum"] else 0)
            state = {
                "status": "queued",
                "plan": plan,
                "queued_at": now_iso(),
                "started_at": None,
                "finished_at": None,
                "errors": [],
                "unavailable": {},
                "progress": {"done": 0, "total": total, "label": "Na fila"},
            }
            record = self.records.set_mapping(record_id, engine_id, state)
            self._queue.append(key)
            self._condition.notify()
            return record

    def cancel(self, record_id: str, engine_id: str) -> None:
        key = (record_id, engine_id)
        with self._condition:
            if key in self._queue:
                self._queue.remove(key)
                record = self.records.get(record_id)
                state = record["mapping"][engine_id]
                state.update(status="cancelled", finished_at=now_iso())
                state["progress"]["label"] = "Cancelado"
                self.records.set_mapping(record_id, engine_id, state)
            elif key == self._current:
                self._cancelled.add(key)
            else:
                raise ValueError("Este registro não está sendo mapeado.")

    def is_busy(self, record_id: str) -> bool:
        with self._condition:
            return any(key[0] == record_id for key in [*self._queue, *([self._current] if self._current else [])])

    def snapshot(self) -> dict[str, Any]:
        with self._condition:
            return {
                "current": list(self._current) if self._current else None,
                "queued": [list(item) for item in self._queue],
            }

    def _loop(self) -> None:
        while True:
            with self._condition:
                while not self._queue:
                    self._condition.wait()
                key = self._queue.popleft()
                self._current = key
            try:
                self._run(*key)
            except Exception as error:  # nunca derruba a fila
                print(f"Mapeamento {key} falhou: {error}", flush=True)
                self._finish(*key, status="error", error=str(error))
            finally:
                with self._condition:
                    self._current = None
                    self._cancelled.discard(key)

    def _state(self, record_id: str, engine_id: str) -> dict[str, Any]:
        return self.records.get(record_id)["mapping"][engine_id]

    def _save(self, record_id: str, engine_id: str, state: dict[str, Any]) -> None:
        self.records.set_mapping(record_id, engine_id, state)

    def _check(self, record_id: str, engine_id: str) -> None:
        with self._condition:
            if (record_id, engine_id) in self._cancelled:
                raise Cancelled()

    def _finish(self, record_id: str, engine_id: str, *, status: str, error: str | None = None) -> None:
        try:
            state = self._state(record_id, engine_id)
        except (FileNotFoundError, KeyError):
            return
        if error:
            state["errors"].append({"bandpass": None, "step": "geral", "error": error})
        state.update(status=status, finished_at=now_iso())
        state["progress"]["label"] = {
            "completed": "Concluído",
            "partial": "Concluído com falhas",
            "cancelled": "Cancelado",
        }.get(status, "Falhou")
        self._save(record_id, engine_id, state)

    def _run(self, record_id: str, engine_id: str) -> None:
        record = self.records.get(record_id)
        state = record["mapping"][engine_id]
        plan = state["plan"]
        worker = self.engines.worker(engine_id)
        state.update(status="running", started_at=now_iso(), errors=[], unavailable={})
        state["progress"].update(done=0, label="Iniciando motor")
        self._save(record_id, engine_id, state)
        variants = worker.variants()
        ra, dec = record["ra_deg"], record["dec_deg"]

        def step(label: str) -> None:
            self._check(record_id, engine_id)
            state["progress"]["label"] = label
            self._save(record_id, engine_id, state)

        def done() -> None:
            state["progress"]["done"] += 1
            self._save(record_id, engine_id, state)

        try:
            if plan["spectrum"]:
                step("Espectro · " + " ".join(b.replace("SPHEREx-", "") for b in plan["bands"]))
                self._spectrum(worker, record_id, engine_id, ra, dec, plan["bands"], state)
                done()
            for config in plan["configs"]:
                key = lab_store.config_key(config["fov_arcmin"], config["sampling"])
                for bandpass in plan["bands"]:
                    short = bandpass.replace("SPHEREx-", "")
                    outcome = None
                    for position, variant in enumerate(variants):
                        step(f"Imagens {config['fov_arcmin']:g}′ {config['sampling']} · {short} · "
                             f"variante {position + 1}/{len(variants)}")
                        profile, color = variant.rsplit("-", 1)
                        outcome, message = self._prefetch(worker, {
                            "ra_deg": ra,
                            "dec_deg": dec,
                            "bandpass": bandpass,
                            "mode": "full",
                            "fov_arcmin": config["fov_arcmin"],
                            "sampling": config["sampling"],
                            "render_profile": profile,
                            "color_mode": color,
                        }, lambda: self._check(record_id, engine_id))
                        if outcome == "unavailable":
                            state["unavailable"].setdefault(f"images:{key}", []).append(bandpass)
                            break
                        if outcome in {"error", "fatal"}:
                            state["errors"].append({
                                "bandpass": bandpass, "step": f"imagens {key} {variant}", "error": message,
                            })
                            if outcome == "fatal":
                                break
                    done()
            step("Exportando para o produto")
            export_for(record_id, engine_id)
        except Cancelled:
            self._finish(record_id, engine_id, status="cancelled")
            return
        self._finish(record_id, engine_id, status="partial" if state["errors"] else "completed")

    def _prefetch(self, worker: EngineWorker, payload: dict[str, Any], check: Any) -> tuple[str, str | None]:
        last_error = None
        for attempt in range(len(RETRY_DELAYS) + 1):
            if attempt:
                time.sleep(RETRY_DELAYS[attempt - 1])
            check()
            status, data = worker.call("POST", "/api/datasets", payload, timeout=300)
            if status == 404:
                return "unavailable", data.get("error")
            if status in {400, 422}:
                return "fatal", data.get("error")  # ex.: mais épocas que o limite
            if status != 200:
                last_error = data.get("error") or f"HTTP {status}"
                continue
            snapshot = self._poll(worker, f"/api/prefetch/{data['prefetch']['job_id']}", check)
            if snapshot is None:
                last_error = "Motor reiniciado durante o pré-carregamento."
                continue
            if snapshot.get("status") == "failed" or snapshot.get("failed"):
                errors = snapshot.get("errors") or [{}]
                last_error = errors[0].get("error") or "Falha ao materializar frames."
                continue
            return "ok", None
        return "error", last_error

    def _spectrum(
        self,
        worker: EngineWorker,
        record_id: str,
        engine_id: str,
        ra: float,
        dec: float,
        bands: list[str],
        state: dict[str, Any],
    ) -> None:
        check = lambda: self._check(record_id, engine_id)  # noqa: E731
        results_dir = DATA_ROOT / "engines" / engine_id / "results" / record_id
        for theme in THEMES:
            summary, last_error = None, None
            for attempt in range(len(RETRY_DELAYS) + 1):
                if attempt:
                    time.sleep(RETRY_DELAYS[attempt - 1])
                check()
                status, data = worker.call("POST", "/api/composites", {
                    "ra_deg": ra, "dec_deg": dec, "bandpasses": bands, "output": "spectrum", "theme": theme,
                }, timeout=120)
                if status != 200:
                    last_error = data.get("error") or f"HTTP {status}"
                    continue
                snapshot = self._poll(worker, f"/api/spectra/{data['job']['job_id']}", check)
                if snapshot is None or snapshot.get("status") != "completed":
                    last_error = (snapshot or {}).get("error") or "Falha ao montar o espectro."
                    continue
                summary = snapshot["result"]
                failed = [band for band in summary["bands"] if band.get("failed")]
                if not failed:
                    break
                last_error = f"{sum(len(b['failed']) for b in failed)} medições falharam por rede."
            if summary is None:
                state["errors"].append({"bandpass": None, "step": f"espectro {theme}", "error": last_error})
                continue
            write_json(results_dir / f"spectrum-{theme}.json", summary)
            unavailable = []
            for band in summary["bands"]:
                if band.get("error") and not band.get("observation_count"):
                    unavailable.append(band["bandpass"])
                elif band.get("failed"):
                    state["errors"].append({
                        "bandpass": band["bandpass"],
                        "step": f"espectro {theme}",
                        "error": f"{len(band['failed'])} observações sem medição (rede).",
                    })
            state["unavailable"]["spectrum"] = unavailable

    @staticmethod
    def _poll(worker: EngineWorker, path: str, check: Any) -> dict[str, Any] | None:
        misses = 0
        while True:
            check()
            status, data = worker.call("GET", path, timeout=30)
            if status == 200:
                misses = 0
                if data.get("status") != "running":
                    return data
            else:
                misses += 1
                if misses > 5:
                    return None
            time.sleep(1.5)


# --------------------------------------------------------------- serviços


REGISTRY: EngineRegistry
ENGINES: EngineManager
RECORDS: RecordStore
QUEUE: MappingQueue
AUTH: BasicAuth


def disk_usage() -> dict[str, float]:
    usage = shutil.disk_usage(DATA_ROOT)
    return {
        "free_gb": round(usage.free / 1e9, 1),
        "total_gb": round(usage.total / 1e9, 1),
        "used_percent": round(100 * usage.used / usage.total, 1),
    }


def coverage_for(record: dict[str, Any], engine_id: str, scan: dict | None = None) -> dict[str, Any]:
    scan = scan if scan is not None else ENGINES.index(engine_id).scan()
    entry = scan.get(coordinate_key(record["ra_deg"], record["dec_deg"]))
    return compute_coverage(record, entry, engine_id, ENGINES.worker(engine_id).variants())


def export_for(record_id: str, engine_id: str) -> dict[str, Any]:
    record = RECORDS.get(record_id)
    engine = REGISTRY.get(engine_id)
    cache_root = REGISTRY.cache_dir(engine_id).resolve()
    entry = ENGINES.index(engine_id).scan().get(coordinate_key(record["ra_deg"], record["dec_deg"]))
    results_dir = DATA_ROOT / "engines" / engine_id / "results" / record_id
    spectra = {theme: read_json(results_dir / f"spectrum-{theme}.json") for theme in THEMES}
    return export_record(record, engine, cache_root, entry, spectra, DATA_ROOT / "exports")


def purge_record_cache(record: dict[str, Any], engine_id: str) -> int:
    entry = ENGINES.index(engine_id).scan().get(coordinate_key(record["ra_deg"], record["dec_deg"]))
    worker = ENGINES.worker(engine_id)
    removed = 0
    for dataset_id in (entry or {}).get("dataset_ids", []):
        status, data = worker.call("DELETE", f"/api/cache/{dataset_id}")
        if status == 409:
            raise RuntimeError(data.get("error") or "Dataset em uso.")
        if status == 200:
            removed += int(data.get("removed", 0))
    results = DATA_ROOT / "engines" / engine_id / "results" / record["id"]
    if results.is_dir():
        shutil.rmtree(results)
    exports = DATA_ROOT / "exports" / engine_id
    for export in exports.glob(f"*-{record['id'][:6]}"):
        if export.is_dir():
            shutil.rmtree(export)
    if exports.is_dir():
        lab_store.write_export_index(exports)
    return removed


class LabHandler(BaseHTTPRequestHandler):
    server_version = "SPHERExLab/1.0"
    protocol_version = "HTTP/1.1"

    def log_message(self, format: str, *args: Any) -> None:  # noqa: A002
        if args and str(args[0]).startswith(("GET /api/e/", "GET /api/records", "GET /cache/")):
            return  # polling frequente
        super().log_message(format, *args)

    # ------------------------------------------------------------ dispatch

    def _authorized(self) -> bool:
        path = urlparse(self.path).path
        if path == "/api/health" and self.client_address[0] in {"127.0.0.1", "::1"}:
            return True
        if AUTH.check(self.headers.get("Authorization")):
            return True
        body = b'{"error": "Autentica\\u00e7\\u00e3o necess\\u00e1ria."}'
        self.close_connection = True
        self.send_response(HTTPStatus.UNAUTHORIZED)
        self.send_header("WWW-Authenticate", 'Basic realm="SPHEREx Lab", charset="UTF-8"')
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
        return False

    def do_GET(self) -> None:  # noqa: N802
        self._dispatch("GET")

    def do_POST(self) -> None:  # noqa: N802
        self._dispatch("POST")

    def do_PATCH(self) -> None:  # noqa: N802
        self._dispatch("PATCH")

    def do_DELETE(self) -> None:  # noqa: N802
        self._dispatch("DELETE")

    def _dispatch(self, method: str) -> None:
        if not self._authorized():
            return
        parsed = urlparse(self.path)
        path = parsed.path
        query = {key: values[0] for key, values in parse_qs(parsed.query).items()}
        parts = [unquote(part) for part in path.strip("/").split("/")] if path != "/" else []
        try:
            if method == "GET" and not path.startswith(("/api/", "/cache/", "/exports/")):
                self._serve_public(path)
            elif parts[:1] == ["cache"] and method == "GET":
                self._serve_cache(parts[1:])
            elif parts[:1] == ["exports"] and method == "GET":
                self._serve_export(parts[1:])
            elif parts[:2] == ["api", "e"] and len(parts) >= 4:
                self._proxy(method, parts[2], "/".join(parts[3:]), parsed.query)
            elif path == "/api/health" and method == "GET":
                self._health(light=query.get("light") == "1")
            elif parts[:2] == ["api", "engines"]:
                self._engines(method, parts[2:])
            elif parts[:2] == ["api", "records"]:
                self._records(method, parts[2:], query)
            elif path == "/api/queue" and method == "GET":
                self._send_json(QUEUE.snapshot())
            else:
                self._send_error(HTTPStatus.NOT_FOUND, "Endpoint não encontrado.")
        except FileNotFoundError as error:
            self._send_error(HTTPStatus.NOT_FOUND, str(error))
        except (ValueError, KeyError, json.JSONDecodeError) as error:
            self._send_error(HTTPStatus.BAD_REQUEST, str(error))
        except RuntimeError as error:
            self._send_error(HTTPStatus.CONFLICT, str(error))
        except Exception as error:  # torna a falha observável na interface
            self.log_error("Erro interno: %s", error)
            self._send_error(HTTPStatus.INTERNAL_SERVER_ERROR, str(error))

    # ------------------------------------------------------------- rotas

    def _health(self, light: bool = False) -> None:
        engines = REGISTRY.list()
        default = engines[-1]["id"] if engines else None
        settings = None
        if default and not light:  # light: healthcheck do container, sem esperar o motor
            try:
                worker = ENGINES.worker(default)
                worker.ensure()
                settings = worker.catalog
            except RuntimeError as error:
                self.log_error("Motor padrão indisponível: %s", error)
        self._send_json({
            "status": "ok",
            "service": "spherex-lab",
            "version": VERSION,
            "engines": engines,
            "default_engine": default,
            "current_code": {"hash": REGISTRY.current_hash, "frozen": REGISTRY.has_current_code()},
            "settings": settings,
            "auth": AUTH.required,
            "disk": disk_usage(),
        })

    def _engines(self, method: str, rest: list[str]) -> None:
        if method == "GET" and not rest:
            self._send_json({"engines": REGISTRY.list(), "current_code_hash": REGISTRY.current_hash})
        elif method == "POST" and not rest:
            payload = self._read_json()
            self._send_json(REGISTRY.create(str(payload.get("title", "")), str(payload.get("description", ""))),
                            HTTPStatus.CREATED)
        elif method == "PATCH" and len(rest) == 1:
            payload = self._read_json()
            self._send_json(REGISTRY.update(
                rest[0],
                title=payload.get("title"),
                description=payload.get("description"),
            ))
        else:
            self._send_error(HTTPStatus.NOT_FOUND, "Endpoint não encontrado.")

    def _engine_id(self, query: dict[str, str]) -> str:
        engine_id = query.get("engine") or REGISTRY.default_id()
        REGISTRY.get(engine_id)
        return engine_id

    def _records(self, method: str, rest: list[str], query: dict[str, str]) -> None:
        if method == "GET" and not rest:
            engine_id = self._engine_id(query)
            scan = ENGINES.index(engine_id).scan()
            records = [{**record, "coverage": coverage_for(record, engine_id, scan)} for record in RECORDS.list()]
            self._send_json({"engine_id": engine_id, "records": records, "queue": QUEUE.snapshot()})
            return
        if method == "POST" and not rest:
            payload = self._read_json()
            record = RECORDS.upsert(
                payload.get("ra_deg"),
                payload.get("dec_deg"),
                name=payload.get("name"),
                description=payload.get("description"),
                query=payload.get("query"),
            )
            self._send_json(record)
            return
        if not rest:
            self._send_error(HTTPStatus.METHOD_NOT_ALLOWED, "Método não permitido.")
            return
        record_id = rest[0]
        if method == "GET" and len(rest) == 1:
            engine_id = self._engine_id(query)
            record = RECORDS.get(record_id)
            self._send_json({**record, "coverage": coverage_for(record, engine_id)})
        elif method == "PATCH" and len(rest) == 1:
            payload = self._read_json()
            self._send_json(RECORDS.update(
                record_id, name=payload.get("name"), description=payload.get("description")
            ))
        elif method == "DELETE" and len(rest) == 1:
            if not ALLOW_DELETE:
                self._send_error(HTTPStatus.FORBIDDEN, DELETE_DISABLED)
                return
            engine_id = self._engine_id(query)
            if QUEUE.is_busy(record_id):
                raise RuntimeError("Cancele o mapeamento deste registro antes de apagá-lo.")
            record = RECORDS.get(record_id)
            removed = purge_record_cache(record, engine_id)
            forgotten = query.get("forget") == "1"
            if forgotten:
                RECORDS.delete(record_id)
            else:
                RECORDS.clear_mapping(record_id, engine_id)
            self._send_json({"removed_datasets": removed, "forgotten": forgotten, "engine_id": engine_id})
        elif method == "POST" and rest[1:] == ["map"]:
            engine_id = self._engine_id(query)
            RECORDS.get(record_id)
            plan = validate_plan(self._read_json())
            self._send_json(QUEUE.enqueue(record_id, engine_id, plan), HTTPStatus.ACCEPTED)
        elif method == "DELETE" and rest[1:] == ["map"]:
            QUEUE.cancel(record_id, self._engine_id(query))
            self._send_json({"cancelled": True})
        elif method == "POST" and rest[1:] == ["export"]:
            engine_id = self._engine_id(query)
            if QUEUE.is_busy(record_id):
                raise RuntimeError("Aguarde o mapeamento terminar para exportar.")
            self._send_json(export_for(record_id, engine_id))
        else:
            self._send_error(HTTPStatus.NOT_FOUND, "Endpoint não encontrado.")

    def _proxy(self, method: str, engine_id: str, rest: str, raw_query: str) -> None:
        if method == "DELETE" and not ALLOW_DELETE:
            self._send_error(HTTPStatus.FORBIDDEN, DELETE_DISABLED)
            return
        REGISTRY.get(engine_id)
        allowed = (
            (method == "POST" and rest in {"datasets", "composites"})
            or (method == "POST" and rest.startswith("datasets/"))
            or (method == "GET" and rest.split("/")[0] in {"prefetch", "spectra"})
            or (method == "DELETE" and rest.startswith("cache/"))
        )
        if not allowed:
            self._send_error(HTTPStatus.NOT_FOUND, "Endpoint do motor não encontrado.")
            return
        if method == "DELETE" and QUEUE.snapshot()["current"]:
            # Apagar um dataset no meio de um mapeamento corromperia o lote.
            raise RuntimeError("Há um mapeamento em andamento; tente de novo quando ele terminar.")
        body = self._read_body() if method == "POST" else None
        path = f"/api/{rest}" + (f"?{raw_query}" if raw_query else "")
        status, content = ENGINES.worker(engine_id).raw(method, path, body)
        # URLs de arquivos do motor ganham o prefixo da versão.
        content = content.replace(b'"/cache/', f'"/cache/{engine_id}/'.encode())
        self._send_bytes(status, content, "application/json; charset=utf-8", "no-store")

    # --------------------------------------------------------- arquivos

    def _serve_cache(self, parts: list[str]) -> None:
        if len(parts) < 3:
            self._send_error(HTTPStatus.NOT_FOUND, "Arquivo não encontrado.")
            return
        root = REGISTRY.cache_dir(parts[0]).resolve()
        target = (root / "/".join(parts[1:])).resolve()
        if not target.is_relative_to(root) or target.suffix.lower() not in {".webp", ".svg"}:
            self._send_error(HTTPStatus.NOT_FOUND, "Arquivo não encontrado.")
            return
        self._send_file(target, "public, max-age=31536000, immutable")

    def _serve_export(self, parts: list[str]) -> None:
        root = (DATA_ROOT / "exports").resolve()
        target = (root / "/".join(parts)).resolve()
        if not target.is_relative_to(root) or target.suffix.lower() not in {".webp", ".svg", ".json"}:
            self._send_error(HTTPStatus.NOT_FOUND, "Arquivo não encontrado.")
            return
        self._send_file(target, "no-cache")

    def _serve_public(self, url_path: str) -> None:
        relative = "index.html" if url_path == "/" else unquote(url_path.lstrip("/"))
        target = (PUBLIC_ROOT / relative).resolve()
        if not target.is_relative_to(PUBLIC_ROOT):
            self._send_error(HTTPStatus.NOT_FOUND, "Arquivo não encontrado.")
            return
        self._send_file(target, "no-cache")

    def _send_file(self, path: Path, cache_control: str) -> None:
        if not path.is_file():
            self._send_error(HTTPStatus.NOT_FOUND, "Arquivo não encontrado.")
            return
        content_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        if content_type.startswith("text/") or content_type in {"application/javascript", "application/json"}:
            content_type += "; charset=utf-8"
        self._send_bytes(HTTPStatus.OK, path.read_bytes(), content_type, cache_control)

    # ------------------------------------------------------------ helpers

    def _read_body(self) -> bytes:
        length = int(self.headers.get("Content-Length", "0"))
        if length < 0 or length > 64 * 1024:
            raise ValueError("Corpo da requisição muito grande.")
        return self.rfile.read(length) if length else b""

    def _read_json(self) -> dict[str, Any]:
        body = self._read_body()
        data = json.loads(body.decode("utf-8")) if body else {}
        if not isinstance(data, dict):
            raise ValueError("JSON deve ser um objeto.")
        return data

    def _send_json(self, data: Any, status: HTTPStatus = HTTPStatus.OK) -> None:
        content = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self._send_bytes(status, content, "application/json; charset=utf-8", "no-store")

    def _send_error(self, status: HTTPStatus, message: str) -> None:
        self._send_json({"error": message}, status)

    def _send_bytes(self, status: int, content: bytes, content_type: str, cache_control: str) -> None:
        if status >= 400:
            # O corpo da requisição pode não ter sido lido: não reutiliza a conexão.
            self.close_connection = True
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(content)))
        self.send_header("Cache-Control", cache_control)
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(content)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    return parser.parse_args()


def main() -> None:
    global REGISTRY, ENGINES, RECORDS, QUEUE, AUTH
    args = parse_args()
    DATA_ROOT.mkdir(parents=True, exist_ok=True)
    AUTH = BasicAuth(DATA_ROOT, os.environ.get("SPHEREX_LAB_AUTH") == "required")
    REGISTRY = EngineRegistry(DATA_ROOT, PROJECT_ROOT, VERSION)
    REGISTRY.ensure_initial(Path(LEGACY_CACHE).expanduser() if LEGACY_CACHE else None)
    ENGINES = EngineManager(REGISTRY)
    RECORDS = RecordStore(DATA_ROOT)
    QUEUE = MappingQueue(RECORDS, ENGINES)
    QUEUE.recover()
    Thread(target=lambda: ENGINES.worker(REGISTRY.default_id()).ensure(), daemon=True).start()
    server = ThreadingHTTPServer((args.host, args.port), LabHandler)
    server.daemon_threads = True
    print(f"SPHEREx Lab: http://{args.host}:{args.port} · dados {DATA_ROOT}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nEncerrando laboratório.")
    finally:
        ENGINES.stop()
        server.server_close()


if __name__ == "__main__":
    main()
