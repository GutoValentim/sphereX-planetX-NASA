"""Gera sequências temporais de cutouts SPHEREx para uma coordenada fixa."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from hashlib import sha256
import json
from pathlib import Path
import re
import shutil
from threading import Lock
from typing import Any, Callable, Iterable

from astropy import units as u
from astropy.coordinates import SkyCoord

from app.schemas.observations import ObservationQuery, ObservationRecord
from app.services.frame_generator import GeneratedFrame, generate_frame_from_array
from app.services.image_aligner import (
    AlignedImage,
    CommonSkyGrid,
    align_fits_image,
    build_common_sky_grid,
)
from app.services.irsa_client import IrsaClient


FIXED_SEQUENCE_FOV_ARCMIN = 30.0
FIXED_SOURCE_CUTOUT_FOV_ARCMIN = 45.0
DEFAULT_SEQUENCE_BANDPASS = "SPHEREx-D3"
DEFAULT_MAX_SEQUENCE_FRAMES = 100
DEFAULT_DOWNLOAD_WORKERS = 8
FRAME_CACHE_VERSION = 2
SEQUENCE_MODES = frozenset({"fast", "balanced", "full"})
_SAFE_IDENTIFIER = re.compile(r"[^A-Za-z0-9._-]+")
_SAFE_REQUEST_ID = re.compile(r"[0-9a-f]{16}")


class SequenceLimitExceeded(ValueError):
    """Indica que a busca excedeu o limite seguro antes dos downloads."""

    def __init__(self, found: int, limit: int) -> None:
        self.found = found
        self.limit = limit
        super().__init__(
            f"A consulta encontrou {found} frames, acima do limite de {limit}."
        )


@dataclass(frozen=True)
class TemporalFrame:
    """Um frame derivado de uma observação, ordenado no tempo."""

    index: int
    observation: ObservationRecord
    gap_from_previous_seconds: float | None
    fits_path: str
    relative_path: str
    frame: GeneratedFrame

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class TemporalSequenceResult:
    """Manifesto da sequência que a futura camada HTTP poderá serializar."""

    request_id: str
    ra_deg: float
    dec_deg: float
    fov_arcmin: float
    cutout_fov_arcmin: float
    bandpass: str
    collections: tuple[str, ...]
    source_observation_count: int
    band_observation_count: int
    frame_count: int
    aligned: bool
    frames: tuple[TemporalFrame, ...]
    manifest_path: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class TemporalDataset:
    """Metadados descobertos antes de qualquer download de imagem."""

    request_id: str
    ra_deg: float
    dec_deg: float
    fov_arcmin: float
    cutout_fov_arcmin: float
    bandpass: str
    collections: tuple[str, ...]
    source_observation_count: int
    band_observation_count: int
    observations: tuple[ObservationRecord, ...]
    discovered_at: str
    cache_hit: bool
    dataset_path: str

    @property
    def frame_count(self) -> int:
        return len(self.observations)

    def to_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data["frame_count"] = self.frame_count
        return data


@dataclass(frozen=True)
class LazyFrameResult:
    """Frame materializado e armazenado para uso por uma camada HTTP."""

    request_id: str
    observation_index: int
    observation: ObservationRecord
    fits_path: str
    relative_path: str
    frame: GeneratedFrame
    cache_hit: bool

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class FramePrefetchFailure:
    """Falha isolada que não interrompe o restante do lote."""

    observation_index: int
    error: str


@dataclass(frozen=True)
class FramePrefetchResult:
    """Resultado do pré-carregamento progressivo de uma sequência."""

    requested_count: int
    frames: tuple[LazyFrameResult, ...]
    failures: tuple[FramePrefetchFailure, ...]

    @property
    def completed_count(self) -> int:
        return len(self.frames)

    @property
    def failed_count(self) -> int:
        return len(self.failures)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


FrameProgressCallback = Callable[
    [int, LazyFrameResult | None, str | None],
    None,
]


class SpherexTemporalSequenceService:
    """Consulta, recorta e converte todas as épocas válidas de uma região."""

    def __init__(
        self,
        irsa_client: IrsaClient | None = None,
        *,
        fov_arcmin: float = FIXED_SEQUENCE_FOV_ARCMIN,
        cutout_fov_arcmin: float = FIXED_SOURCE_CUTOUT_FOV_ARCMIN,
        bandpass: str = DEFAULT_SEQUENCE_BANDPASS,
        max_frames: int = DEFAULT_MAX_SEQUENCE_FRAMES,
        download_workers: int = DEFAULT_DOWNLOAD_WORKERS,
    ) -> None:
        if not 0 < fov_arcmin <= 60:
            raise ValueError("fov_arcmin deve estar no intervalo (0, 60].")
        if not fov_arcmin <= cutout_fov_arcmin <= 60:
            raise ValueError(
                "cutout_fov_arcmin deve ser maior ou igual ao FOV final e no máximo 60."
            )
        if max_frames <= 0:
            raise ValueError("max_frames deve ser maior que zero.")
        if not 1 <= download_workers <= 8:
            raise ValueError("download_workers deve estar no intervalo [1, 8].")

        self.irsa_client = irsa_client or IrsaClient()
        self.fov_arcmin = fov_arcmin
        self.cutout_fov_arcmin = cutout_fov_arcmin
        self.bandpass = bandpass
        self.max_frames = max_frames
        self.download_workers = download_workers
        self._locks_guard = Lock()
        self._cache_locks: dict[str, Lock] = {}
        self._frame_locks: dict[tuple[str, int], Lock] = {}

    def discover_dataset(
        self,
        *,
        ra_deg: float,
        dec_deg: float,
        output_directory: Path,
        collections: tuple[str, ...] = ("spherex_dr1", "spherex_qr3"),
        start_time: datetime | None = None,
        end_time: datetime | None = None,
        use_cache: bool = True,
    ) -> TemporalDataset:
        """Descobre épocas e grava apenas metadados, sem baixar FITS."""

        request_id = _request_id(
            ra_deg=ra_deg,
            dec_deg=dec_deg,
            fov_arcmin=self.fov_arcmin,
            cutout_fov_arcmin=self.cutout_fov_arcmin,
            bandpass=self.bandpass,
            collections=collections,
            start_time=start_time,
            end_time=end_time,
        )
        root = output_directory.expanduser().resolve()
        dataset_path = root / request_id / "dataset.json"
        if use_cache and dataset_path.exists():
            return _load_dataset(dataset_path, cache_hit=True)

        observations, band_observations, candidates = self._query_candidates(
            ra_deg=ra_deg,
            dec_deg=dec_deg,
            collections=collections,
            start_time=start_time,
            end_time=end_time,
        )
        dataset = TemporalDataset(
            request_id=request_id,
            ra_deg=ra_deg,
            dec_deg=dec_deg,
            fov_arcmin=self.fov_arcmin,
            cutout_fov_arcmin=self.cutout_fov_arcmin,
            bandpass=self.bandpass,
            collections=collections,
            source_observation_count=len(observations),
            band_observation_count=len(band_observations),
            observations=tuple(candidates),
            discovered_at=datetime.now(timezone.utc).isoformat(),
            cache_hit=False,
            dataset_path=str(dataset_path),
        )
        _write_manifest(dataset_path, dataset.to_dict())
        return dataset

    def load_dataset(
        self,
        output_directory: Path,
        request_id: str,
    ) -> TemporalDataset:
        """Carrega um dataset cacheado por um identificador validado."""

        dataset_path = self._cache_target(output_directory, request_id) / "dataset.json"
        if not dataset_path.exists():
            raise FileNotFoundError(f"Dataset {request_id} não encontrado no cache.")
        return _load_dataset(dataset_path, cache_hit=True)

    def select_indices(self, dataset: TemporalDataset, mode: str) -> list[int]:
        """Seleciona épocas para os modos rápido, balanceado ou completo."""

        if mode not in SEQUENCE_MODES:
            values = ", ".join(sorted(SEQUENCE_MODES))
            raise ValueError(f"Modo inválido. Use um de: {values}.")
        count = dataset.frame_count
        if mode == "full" or count <= 1:
            return list(range(count))
        if mode == "balanced":
            return _evenly_spaced_indices(count, limit=12)
        return _fast_sequence_indices(dataset.observations, limit=4)

    def materialize_frame(
        self,
        *,
        dataset: TemporalDataset,
        observation_index: int,
        output_directory: Path,
        overwrite: bool = False,
    ) -> LazyFrameResult:
        """Baixa, converte e armazena um frame, reutilizando o cache existente."""

        if not 0 <= observation_index < dataset.frame_count:
            raise IndexError("observation_index fora do intervalo do dataset.")
        root = output_directory.expanduser().resolve()
        dataset_directory = self._cache_target(root, dataset.request_id)
        state_lock = self._cache_lock(dataset.request_id)
        frame_lock = self._frame_lock(dataset.request_id, observation_index)
        with frame_lock:
            state_path = dataset_directory / "frame-cache.json"
            observation = dataset.observations[observation_index]
            with state_lock:
                state = _read_frame_state(state_path)
                cached = state["frames"].get(observation.observation_id)
                if cached and not overwrite:
                    result = _lazy_frame_from_dict(cached, cache_hit=True)
                    if Path(result.fits_path).exists() and Path(result.frame.path).exists():
                        return result

            fits_directory = dataset_directory / "fits"
            frames_directory = dataset_directory / "frames"
            fits_path = self.irsa_client.download(
                observation,
                fits_directory,
                cutout_center=(dataset.ra_deg, dataset.dec_deg),
                cutout_size_deg=dataset.cutout_fov_arcmin / 60,
                overwrite=overwrite,
            )
            identifier = _SAFE_IDENTIFIER.sub("_", observation.observation_id)
            frame_path = frames_directory / f"{observation_index + 1:03d}_{identifier}.webp"
            with state_lock:
                state = _read_frame_state(state_path)
                if state["common_grid"] is None:
                    grid = build_common_sky_grid(
                        fits_path,
                        center_ra_deg=dataset.ra_deg,
                        center_dec_deg=dataset.dec_deg,
                        fov_arcmin=dataset.fov_arcmin,
                    )
                    state["common_grid"] = grid.to_dict()
                    _write_manifest(state_path, state)
                else:
                    grid = CommonSkyGrid.from_dict(state["common_grid"])

            aligned_image = align_fits_image(fits_path, grid)
            with state_lock:
                state = _read_frame_state(state_path)
                if state["display_min"] is None or state["display_max"] is None:
                    generated = _generate_aligned_frame(
                        aligned_image,
                        frame_path,
                        grid,
                    )
                    state["display_min"] = generated.display_min
                    state["display_max"] = generated.display_max
                    result = LazyFrameResult(
                        request_id=dataset.request_id,
                        observation_index=observation_index,
                        observation=observation,
                        fits_path=str(fits_path),
                        relative_path=str(frame_path.relative_to(dataset_directory)),
                        frame=generated,
                        cache_hit=False,
                    )
                    state["frames"][observation.observation_id] = result.to_dict()
                    _write_manifest(state_path, state)
                    return result
                display_min = float(state["display_min"])
                display_max = float(state["display_max"])

            generated = _generate_aligned_frame(
                aligned_image,
                frame_path,
                grid,
                display_min=display_min,
                display_max=display_max,
            )

            result = LazyFrameResult(
                request_id=dataset.request_id,
                observation_index=observation_index,
                observation=observation,
                fits_path=str(fits_path),
                relative_path=str(frame_path.relative_to(dataset_directory)),
                frame=generated,
                cache_hit=False,
            )
            with state_lock:
                state = _read_frame_state(state_path)
                state["frames"][observation.observation_id] = result.to_dict()
                _write_manifest(state_path, state)
            return result

    def prefetch_frames(
        self,
        *,
        dataset: TemporalDataset,
        observation_indices: Iterable[int],
        output_directory: Path,
        overwrite: bool = False,
        on_progress: FrameProgressCallback | None = None,
    ) -> FramePrefetchResult:
        """Materializa todo o lote e informa cada frame assim que ele fica pronto.

        O primeiro índice é processado antes dos demais para liberar rapidamente
        o frame inicial e estabelecer uma escala visual comum. Os restantes são
        baixados e convertidos em paralelo.
        """

        indices = list(dict.fromkeys(observation_indices))
        for observation_index in indices:
            if not 0 <= observation_index < dataset.frame_count:
                raise IndexError("observation_index fora do intervalo do dataset.")
        if not indices:
            return FramePrefetchResult(0, (), ())

        frames: list[LazyFrameResult] = []
        failures: list[FramePrefetchFailure] = []

        def materialize(observation_index: int) -> LazyFrameResult:
            return self.materialize_frame(
                dataset=dataset,
                observation_index=observation_index,
                output_directory=output_directory,
                overwrite=overwrite,
            )

        def record(
            observation_index: int,
            result: LazyFrameResult | None,
            error: Exception | None,
        ) -> None:
            message = str(error) if error is not None else None
            if result is not None:
                frames.append(result)
            else:
                failures.append(
                    FramePrefetchFailure(
                        observation_index=observation_index,
                        error=message or "Falha desconhecida ao materializar frame.",
                    )
                )
            if on_progress is not None:
                on_progress(observation_index, result, message)

        first, *remaining = indices
        try:
            record(first, materialize(first), None)
        except Exception as error:  # uma época indisponível não invalida o lote
            record(first, None, error)

        if remaining:
            workers = min(self.download_workers, len(remaining))
            with ThreadPoolExecutor(max_workers=workers) as executor:
                futures = {executor.submit(materialize, index): index for index in remaining}
                for future in as_completed(futures):
                    observation_index = futures[future]
                    try:
                        record(observation_index, future.result(), None)
                    except Exception as error:
                        record(observation_index, None, error)

        order = {observation_index: position for position, observation_index in enumerate(indices)}
        frames.sort(key=lambda item: order[item.observation_index])
        failures.sort(key=lambda item: order[item.observation_index])
        return FramePrefetchResult(
            requested_count=len(indices),
            frames=tuple(frames),
            failures=tuple(failures),
        )

    def clear_cache(
        self,
        output_directory: Path,
        request_id: str | None = None,
    ) -> int:
        """Remove caches gerados pelo serviço; os dados podem ser regenerados."""

        root = output_directory.expanduser().resolve()
        if not root.exists():
            return 0
        if request_id is not None:
            target = self._cache_target(root, request_id)
            if not target.exists():
                return 0
            with self._cache_lock(request_id):
                shutil.rmtree(target)
            return 1

        removed = 0
        for child in root.iterdir():
            if child.is_dir() and _SAFE_REQUEST_ID.fullmatch(child.name):
                with self._cache_lock(child.name):
                    shutil.rmtree(child)
                removed += 1
        return removed

    def _cache_target(self, output_directory: Path, request_id: str) -> Path:
        if not _SAFE_REQUEST_ID.fullmatch(request_id):
            raise ValueError("request_id inválido.")
        root = output_directory.expanduser().resolve()
        target = (root / request_id).resolve()
        if target.parent != root:
            raise ValueError("request_id fora do diretório de cache.")
        return target

    def _cache_lock(self, request_id: str) -> Lock:
        with self._locks_guard:
            return self._cache_locks.setdefault(request_id, Lock())

    def _frame_lock(self, request_id: str, observation_index: int) -> Lock:
        with self._locks_guard:
            return self._frame_locks.setdefault((request_id, observation_index), Lock())

    def create_sequence(
        self,
        *,
        ra_deg: float,
        dec_deg: float,
        output_directory: Path,
        collections: tuple[str, ...] = ("spherex_dr1", "spherex_qr3"),
        start_time: datetime | None = None,
        end_time: datetime | None = None,
        overwrite: bool = False,
    ) -> TemporalSequenceResult:
        """Executa uma busca nova e devolve frames WebP em ordem cronológica.

        Cada FITS é reprojetado para uma grade TAN comum, centrada exatamente
        nas coordenadas solicitadas e com norte para cima.
        """

        observations, band_observations, candidates = self._query_candidates(
            ra_deg=ra_deg,
            dec_deg=dec_deg,
            collections=collections,
            start_time=start_time,
            end_time=end_time,
        )

        request_id = _request_id(
            ra_deg=ra_deg,
            dec_deg=dec_deg,
            fov_arcmin=self.fov_arcmin,
            cutout_fov_arcmin=self.cutout_fov_arcmin,
            bandpass=self.bandpass,
            collections=collections,
            start_time=start_time,
            end_time=end_time,
        )
        sequence_directory = output_directory.expanduser().resolve() / request_id
        fits_directory = sequence_directory / "fits"
        frames_directory = sequence_directory / "frames"
        manifest_path = sequence_directory / "manifest.json"
        fits_directory.mkdir(parents=True, exist_ok=True)
        frames_directory.mkdir(parents=True, exist_ok=True)

        fits_paths = self._download_candidates(
            candidates,
            fits_directory=fits_directory,
            center=(ra_deg, dec_deg),
            overwrite=overwrite,
        )
        common_grid = build_common_sky_grid(
            fits_paths[0],
            center_ra_deg=ra_deg,
            center_dec_deg=dec_deg,
            fov_arcmin=self.fov_arcmin,
        )
        frames = self._generate_frames(
            candidates,
            fits_paths=fits_paths,
            frames_directory=frames_directory,
            sequence_directory=sequence_directory,
            common_grid=common_grid,
        )

        result = TemporalSequenceResult(
            request_id=request_id,
            ra_deg=ra_deg,
            dec_deg=dec_deg,
            fov_arcmin=self.fov_arcmin,
            cutout_fov_arcmin=self.cutout_fov_arcmin,
            bandpass=self.bandpass,
            collections=collections,
            source_observation_count=len(observations),
            band_observation_count=len(band_observations),
            frame_count=len(frames),
            aligned=True,
            frames=tuple(frames),
            manifest_path=str(manifest_path),
        )
        _write_manifest(manifest_path, result.to_dict())
        return result

    def _query_candidates(
        self,
        *,
        ra_deg: float,
        dec_deg: float,
        collections: tuple[str, ...],
        start_time: datetime | None,
        end_time: datetime | None,
    ) -> tuple[list[ObservationRecord], list[ObservationRecord], list[ObservationRecord]]:
        query = ObservationQuery(
            ra_deg=ra_deg,
            dec_deg=dec_deg,
            radius_arcsec=30.0,
            collections=collections,
            start_time=start_time,
            end_time=end_time,
        )
        observations = self.irsa_client.search(query)
        band_observations = [
            observation
            for observation in observations
            if observation.bandpass == self.bandpass
            and observation.observed_at is not None
            and observation.access_url
        ]
        candidates = _unique_observations(
            observation
            for observation in band_observations
            if _footprint_covers_window(
                observation.spatial_region,
                ra_deg=ra_deg,
                dec_deg=dec_deg,
                fov_arcmin=self.cutout_fov_arcmin,
            )
        )
        candidates.sort(key=lambda item: item.observed_at or "")
        if not candidates:
            raise LookupError(
                "Nenhuma observação cobre integralmente a janela temporal solicitada."
            )
        if len(candidates) > self.max_frames:
            raise SequenceLimitExceeded(len(candidates), self.max_frames)
        return observations, band_observations, candidates

    def _download_candidates(
        self,
        candidates: list[ObservationRecord],
        *,
        fits_directory: Path,
        center: tuple[float, float],
        overwrite: bool,
    ) -> list[Path]:
        def download(observation: ObservationRecord) -> Path:
            return self.irsa_client.download(
                observation,
                fits_directory,
                cutout_center=center,
                cutout_size_deg=self.cutout_fov_arcmin / 60,
                overwrite=overwrite,
            )

        workers = min(self.download_workers, len(candidates))
        with ThreadPoolExecutor(max_workers=workers) as executor:
            return list(executor.map(download, candidates))

    def _generate_frames(
        self,
        candidates: list[ObservationRecord],
        *,
        fits_paths: list[Path],
        frames_directory: Path,
        sequence_directory: Path,
        common_grid: CommonSkyGrid,
    ) -> list[TemporalFrame]:
        frames: list[TemporalFrame] = []
        display_range: tuple[float, float] | None = None
        previous_time: datetime | None = None

        for index, (observation, fits_path) in enumerate(
            zip(candidates, fits_paths, strict=True), start=1
        ):
            identifier = _SAFE_IDENTIFIER.sub("_", observation.observation_id)
            output_path = frames_directory / f"{index:03d}_{identifier}.webp"
            aligned_image = align_fits_image(fits_path, common_grid)
            options: dict[str, float] = {}
            if display_range is not None:
                options = {
                    "display_min": display_range[0],
                    "display_max": display_range[1],
                }
            generated = _generate_aligned_frame(
                aligned_image,
                output_path,
                common_grid,
                **options,
            )
            if display_range is None:
                display_range = (generated.display_min, generated.display_max)

            observed_at = _parse_timestamp(observation.observed_at)
            gap = None
            if previous_time is not None and observed_at is not None:
                gap = (observed_at - previous_time).total_seconds()
            if observed_at is not None:
                previous_time = observed_at

            frames.append(
                TemporalFrame(
                    index=index,
                    observation=observation,
                    gap_from_previous_seconds=gap,
                    fits_path=str(fits_path),
                    relative_path=str(output_path.relative_to(sequence_directory)),
                    frame=generated,
                )
            )
        return frames


def _unique_observations(
    observations: Iterable[ObservationRecord],
) -> list[ObservationRecord]:
    unique: dict[tuple[str, str | None, str | None], ObservationRecord] = {}
    for observation in observations:
        key = (
            observation.observation_id,
            observation.bandpass,
            observation.observed_at,
        )
        unique.setdefault(key, observation)
    return list(unique.values())


def _evenly_spaced_indices(count: int, *, limit: int) -> list[int]:
    if count <= limit:
        return list(range(count))
    if limit == 1:
        return [0]
    indices = {
        round(position * (count - 1) / (limit - 1))
        for position in range(limit)
    }
    return sorted(indices)


def _fast_sequence_indices(
    observations: tuple[ObservationRecord, ...],
    *,
    limit: int,
) -> list[int]:
    if not observations:
        return []
    runs: list[list[int]] = []
    current = [0]
    for index in range(1, len(observations)):
        previous = _parse_timestamp(observations[index - 1].observed_at)
        observed = _parse_timestamp(observations[index].observed_at)
        gap = None
        if previous is not None and observed is not None:
            gap = (observed - previous).total_seconds()
        if gap is not None and gap <= 180.5:
            current.append(index)
        else:
            runs.append(current)
            current = [index]
    runs.append(current)
    best = max(runs, key=len)
    return best[:limit]


def _request_id(
    *,
    ra_deg: float,
    dec_deg: float,
    fov_arcmin: float,
    cutout_fov_arcmin: float,
    bandpass: str,
    collections: tuple[str, ...],
    start_time: datetime | None,
    end_time: datetime | None,
) -> str:
    payload = json.dumps(
        {
            "ra_deg": round(ra_deg, 9),
            "dec_deg": round(dec_deg, 9),
            "fov_arcmin": fov_arcmin,
            "cutout_fov_arcmin": cutout_fov_arcmin,
            "bandpass": bandpass,
            "collections": collections,
            "start_time": start_time.isoformat() if start_time else None,
            "end_time": end_time.isoformat() if end_time else None,
        },
        sort_keys=True,
    )
    return sha256(payload.encode("utf-8")).hexdigest()[:16]


def _load_dataset(path: Path, *, cache_hit: bool) -> TemporalDataset:
    data = json.loads(path.read_text(encoding="utf-8"))
    observations = tuple(
        ObservationRecord(**observation) for observation in data["observations"]
    )
    return TemporalDataset(
        request_id=data["request_id"],
        ra_deg=float(data["ra_deg"]),
        dec_deg=float(data["dec_deg"]),
        fov_arcmin=float(data["fov_arcmin"]),
        cutout_fov_arcmin=float(data.get("cutout_fov_arcmin", data["fov_arcmin"])),
        bandpass=data["bandpass"],
        collections=tuple(data["collections"]),
        source_observation_count=int(data["source_observation_count"]),
        band_observation_count=int(data["band_observation_count"]),
        observations=observations,
        discovered_at=data["discovered_at"],
        cache_hit=cache_hit,
        dataset_path=str(path),
    )


def _read_frame_state(path: Path) -> dict[str, Any]:
    if not path.exists():
        return _empty_frame_state()
    data = json.loads(path.read_text(encoding="utf-8"))
    if data.get("processing_version") != FRAME_CACHE_VERSION:
        return _empty_frame_state()
    if not isinstance(data.get("frames"), dict):
        raise ValueError("Cache de frames inválido.")
    if data.get("common_grid") is not None:
        CommonSkyGrid.from_dict(data["common_grid"])
    return data


def _empty_frame_state() -> dict[str, Any]:
    return {
        "processing_version": FRAME_CACHE_VERSION,
        "display_min": None,
        "display_max": None,
        "common_grid": None,
        "frames": {},
    }


def _generate_aligned_frame(
    aligned_image: AlignedImage,
    output_path: Path,
    grid: CommonSkyGrid,
    *,
    display_min: float | None = None,
    display_max: float | None = None,
) -> GeneratedFrame:
    return generate_frame_from_array(
        aligned_image.data,
        output_path,
        source_unit=aligned_image.source_unit,
        display_min=display_min,
        display_max=display_max,
        aligned=True,
        center_ra_deg=grid.center_ra_deg,
        center_dec_deg=grid.center_dec_deg,
        coverage_fraction=aligned_image.coverage_fraction,
    )


def _lazy_frame_from_dict(data: dict[str, Any], *, cache_hit: bool) -> LazyFrameResult:
    return LazyFrameResult(
        request_id=data["request_id"],
        observation_index=int(data["observation_index"]),
        observation=ObservationRecord(**data["observation"]),
        fits_path=data["fits_path"],
        relative_path=data["relative_path"],
        frame=GeneratedFrame(**data["frame"]),
        cache_hit=cache_hit,
    )


def _footprint_covers_window(
    spatial_region: str | None,
    *,
    ra_deg: float,
    dec_deg: float,
    fov_arcmin: float,
) -> bool:
    polygon = _spatial_polygon_offsets(
        spatial_region,
        ra_deg=ra_deg,
        dec_deg=dec_deg,
    )
    if polygon is None:
        return False

    half_size_deg = fov_arcmin / 120
    corners = (
        (-half_size_deg, -half_size_deg),
        (-half_size_deg, half_size_deg),
        (half_size_deg, -half_size_deg),
        (half_size_deg, half_size_deg),
    )
    return all(_point_in_polygon(x, y, polygon) for x, y in corners)


def _spatial_polygon_offsets(
    spatial_region: str | None,
    *,
    ra_deg: float,
    dec_deg: float,
) -> list[tuple[float, float]] | None:
    if not spatial_region:
        return None
    parts = spatial_region.split()
    if len(parts) < 10 or parts[0].upper() != "POLYGON" or parts[1].upper() != "ICRS":
        return None
    try:
        values = [float(value) for value in parts[2:]]
    except ValueError:
        return None
    if len(values) % 2 or len(values) < 8:
        return None

    coordinates = list(zip(values[0::2], values[1::2]))
    if coordinates[0] == coordinates[-1]:
        coordinates.pop()
    center = SkyCoord(ra_deg, dec_deg, unit="deg", frame="icrs")
    sky = SkyCoord(
        [ra for ra, _ in coordinates],
        [dec for _, dec in coordinates],
        unit="deg",
        frame="icrs",
    )
    offsets = sky.transform_to(center.skyoffset_frame())
    longitudes = offsets.lon.wrap_at(180 * u.deg).to_value(u.deg)
    latitudes = offsets.lat.to_value(u.deg)
    return list(zip(longitudes, latitudes))


def _point_in_polygon(
    x: float,
    y: float,
    polygon: list[tuple[float, float]],
) -> bool:
    inside = False
    for index, (x1, y1) in enumerate(polygon):
        x2, y2 = polygon[(index + 1) % len(polygon)]
        cross = (x - x1) * (y2 - y1) - (y - y1) * (x2 - x1)
        if (
            abs(cross) < 1e-10
            and min(x1, x2) - 1e-10 <= x <= max(x1, x2) + 1e-10
            and min(y1, y2) - 1e-10 <= y <= max(y1, y2) + 1e-10
        ):
            return True
        if (y1 > y) != (y2 > y):
            intersection_x = (x2 - x1) * (y - y1) / (y2 - y1) + x1
            if x < intersection_x:
                inside = not inside
    return inside


def _parse_timestamp(value: str | None) -> datetime | None:
    if value is None:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _write_manifest(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".json.part")
    temporary.write_text(
        json.dumps(data, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    temporary.replace(path)
