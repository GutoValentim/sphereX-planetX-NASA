"""Espectro SPHEREx de uma coordenada por fotometria forçada multi-época.

Não existe espectro "pronto" em uma única observação: o SPHEREx usa filtros
lineares variáveis, então o comprimento de onda muda ao longo do detector
(extensão ``WCS-WAVE``). Cada exposição mede o alvo em um único λ por banda.
O espectro surge ao juntar as várias observações em que o alvo caiu em
posições diferentes do filtro: para cada uma medimos o fluxo no RA/Dec
(abertura circular menos fundo local) e lemos o λ daquele pixel.
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import asdict, dataclass, field
from hashlib import sha256
import json
from math import pi
from pathlib import Path
from threading import BoundedSemaphore, Lock
import time
from typing import Any, Callable, Sequence

from astropy.coordinates import SkyCoord
from astropy.io import fits
from astropy.stats import sigma_clipped_stats
from astropy.wcs import WCS
from astropy.wcs.utils import proj_plane_pixel_area
import numpy as np
from scipy import ndimage

from app.schemas.observations import ObservationRecord
from app.services.cutout_cache import CalibrationStore, obtain_cutout
from app.services.image_aligner import source_wavelength_map
from app.services.spectral_color import SPHEREX_BANDS, get_spherex_band
from app.services.spectrum_chart import ChartSeries, render_spectrum_svg
from app.services.temporal_sequence_service import (
    SpherexTemporalSequenceService,
    TemporalDataset,
    _write_manifest,
)


SPECTRUM_VERSION = 1
# Recorte pequeno: só precisamos do alvo e de um anel de fundo ao redor.
SPECTRUM_FOV_ARCMIN = 3.0
SPECTRUM_CUTOUT_ARCMIN = 4.0
# Pixel ~6,15″ e PSF FWHM ~7,4″: raio de 3 px (~2,5 FWHM) capta quase todo o
# fluxo em todas as bandas, e o anel 6–10 px mede o fundo (inclui luz zodiacal).
APERTURE_RADIUS_PX = 3.0
ANNULUS_PX = (6.0, 10.0)
CHANNELS_PER_BAND = 17
# Cada observação vira um ponto do espectro; o limite só protege contra campos
# profundos com centenas de visitas (recortes de 4′ são pequenos).
SPECTRUM_MAX_OBSERVATIONS = 300
MJY_PER_SR_TO_MJY = 1e9  # 1 MJy = 10^9 mJy

ProgressCallback = Callable[[int, int], None]



@dataclass(frozen=True)
class SpectralPoint:
    """Uma medição do alvo em uma observação: um λ, um fluxo."""

    observation_id: str
    observed_at: str | None
    bandpass: str
    wavelength_um: float
    bandwidth_um: float
    flux_mjy: float
    flux_error_mjy: float
    background_mjy_sr: float
    aperture_pixels: int
    pixel_x: float
    pixel_y: float

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class PhotometryRejected(ValueError):
    """A observação não fornece uma medição confiável do alvo."""


@dataclass(frozen=True)
class BandSpectrum:
    bandpass: str
    band: dict[str, Any]
    request_id: str | None
    points: tuple[SpectralPoint, ...]
    channels: tuple[tuple[float, float], ...]
    rejected: dict[str, str]
    observation_count: int
    error: str | None = None
    failed: dict[str, str] = field(default_factory=dict)
    outliers: tuple[str, ...] = ()

    def to_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data["points"] = [point.to_dict() for point in self.points]
        return data


@dataclass(frozen=True)
class SpectrumResult:
    ra_deg: float
    dec_deg: float
    bands: tuple[BandSpectrum, ...]
    band_charts: dict[str, str]
    combined_chart: str
    composite_id: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "ra_deg": self.ra_deg,
            "dec_deg": self.dec_deg,
            "composite_id": self.composite_id,
            "bands": [band.to_dict() for band in self.bands],
            "band_charts": self.band_charts,
            "combined_chart": self.combined_chart,
        }


def measure_spectral_point(
    fits_path: Path,
    observation: ObservationRecord,
    *,
    ra_deg: float,
    dec_deg: float,
    aperture_radius_px: float = APERTURE_RADIUS_PX,
    annulus_px: tuple[float, float] = ANNULUS_PX,
) -> SpectralPoint:
    """Fotometria de abertura no RA/Dec, com fundo local e λ do ``WCS-WAVE``."""

    band = get_spherex_band(observation.bandpass or "")
    with fits.open(fits_path, memmap=False) as hdus:
        image_hdu = hdus["IMAGE"]
        data = np.asarray(image_hdu.data, dtype=np.float64)
        variance = (
            np.asarray(hdus["VARIANCE"].data, dtype=np.float64) if "VARIANCE" in hdus else None
        )
        wcs = WCS(image_hdu.header).celestial
        x, y = (float(value) for value in wcs.world_to_pixel(
            SkyCoord(ra_deg, dec_deg, unit="deg", frame="icrs")
        ))
        wavelength = _wavelength_at(hdus, image_hdu, data.shape, x, y)

    height, width = data.shape
    outer = annulus_px[1]
    if not (outer <= x <= width - 1 - outer and outer <= y <= height - 1 - outer):
        raise PhotometryRejected("alvo perto da borda do recorte")
    if wavelength is None or not np.isfinite(wavelength):
        raise PhotometryRejected("sem comprimento de onda (WCS-WAVE) na posição")

    yy, xx = np.indices(data.shape)
    distance = np.hypot(xx - x, yy - y)
    aperture = distance <= aperture_radius_px
    annulus = (distance >= annulus_px[0]) & (distance <= annulus_px[1])
    if not np.isfinite(data[aperture]).all():
        raise PhotometryRejected("pixels inválidos na abertura (saturação ou falha)")
    ring = data[annulus & np.isfinite(data)]
    if ring.size < 20:
        raise PhotometryRejected("anel de fundo com poucos pixels válidos")
    _, background, background_std = sigma_clipped_stats(ring, sigma=3.0, maxiters=5)

    count = int(aperture.sum())
    surface_sum = float(np.sum(data[aperture] - background))
    variance_sum = (
        float(np.nansum(variance[aperture])) if variance is not None else count * background_std**2
    )
    error_sum = np.sqrt(variance_sum + count**2 * background_std**2 / ring.size)
    pixel_sr = abs(float(proj_plane_pixel_area(wcs))) * (pi / 180) ** 2
    scale = pixel_sr * MJY_PER_SR_TO_MJY
    return SpectralPoint(
        observation_id=observation.observation_id,
        observed_at=observation.observed_at,
        bandpass=band.bandpass,
        wavelength_um=float(wavelength),
        bandwidth_um=float(wavelength) / band.resolving_power,
        flux_mjy=surface_sum * scale,
        flux_error_mjy=float(error_sum) * scale,
        background_mjy_sr=float(background),
        aperture_pixels=count,
        pixel_x=x,
        pixel_y=y,
    )


def _wavelength_at(
    hdus: fits.HDUList, image_hdu: Any, shape: tuple[int, int], x: float, y: float
) -> float | None:
    wavelength = source_wavelength_map(hdus, image_hdu, shape)
    if wavelength is None:
        return None
    value = ndimage.map_coordinates(wavelength, [[y], [x]], order=1, mode="nearest")[0]
    return float(value) if np.isfinite(value) else None


def flag_outliers(points: Sequence[SpectralPoint], window: int = 7) -> set[str]:
    """Pontos muito fora da vizinhança espectral (raio cósmico, fonte vizinha, falha).

    Compara cada ponto com a mediana dos vizinhos em λ; é outlier se o desvio
    passar de 5σ robustos (MAD) da banda e de 3× o próprio erro.
    """

    ordered = sorted(points, key=lambda point: point.wavelength_um)
    if len(ordered) < 5:
        return set()
    flux = np.array([point.flux_mjy for point in ordered])
    half = window // 2
    residual = np.array([
        flux[i] - np.median(np.delete(flux[max(0, i - half) : i + half + 1], min(i, half)))
        for i in range(len(flux))
    ])
    scale = 1.4826 * np.median(np.abs(residual - np.median(residual)))
    if scale <= 0:
        return set()
    return {
        point.observation_id
        for point, value in zip(ordered, residual)
        if abs(value) > 5 * scale and abs(value) > 3 * point.flux_error_mjy
    }


def channel_medians(
    points: Sequence[SpectralPoint],
    bandpass: str,
    channels: int = CHANNELS_PER_BAND,
    exclude: set[str] | None = None,
) -> tuple[tuple[float, float], ...]:
    """Mediana por canal (17 por banda, espaçados em log λ) para a linha do gráfico."""

    band = get_spherex_band(bandpass)
    points = [p for p in points if p.observation_id not in (exclude or set())]
    edges = np.geomspace(band.wavelength_min_um, band.wavelength_max_um, channels + 1)
    result = []
    for low, high in zip(edges[:-1], edges[1:]):
        inside = [p for p in points if low <= p.wavelength_um < high]
        if inside:
            result.append(
                (
                    float(np.median([p.wavelength_um for p in inside])),
                    float(np.median([p.flux_mjy for p in inside])),
                )
            )
    return tuple(result)


class SpherexSpectrumService:
    """Monta, guarda em cache e desenha o espectro D1–D6 de uma coordenada."""

    def __init__(
        self,
        irsa_client: Any | None = None,
        *,
        download_workers: int = 8,
        retry_attempts: int = 3,
        retry_delay_seconds: float = 1.5,
    ) -> None:
        self.irsa_client = irsa_client
        self.download_workers = download_workers
        self.retry_attempts = retry_attempts
        self.retry_delay_seconds = retry_delay_seconds
        # Limite global de conexões ao IRSA, compartilhado entre as bandas:
        # dezenas de requisições simultâneas fazem o serviço recusar parte delas.
        self._network = BoundedSemaphore(download_workers)
        self._services: dict[str, SpherexTemporalSequenceService] = {}
        self._lock = Lock()

    def _service(self, bandpass: str) -> SpherexTemporalSequenceService:
        with self._lock:
            if bandpass not in self._services:
                self._services[bandpass] = SpherexTemporalSequenceService(
                    self.irsa_client,
                    bandpass=bandpass,
                    fov_arcmin=SPECTRUM_FOV_ARCMIN,
                    cutout_fov_arcmin=SPECTRUM_CUTOUT_ARCMIN,
                    download_workers=self.download_workers,
                    max_frames=SPECTRUM_MAX_OBSERVATIONS,
                )
            return self._services[bandpass]

    def band_spectrum(
        self,
        *,
        ra_deg: float,
        dec_deg: float,
        bandpass: str,
        output_directory: Path,
        on_progress: ProgressCallback | None = None,
    ) -> BandSpectrum:
        band = get_spherex_band(bandpass)
        service = self._service(band.bandpass)
        try:
            dataset = service.discover_dataset(
                ra_deg=ra_deg, dec_deg=dec_deg, output_directory=output_directory
            )
        except (LookupError, ValueError) as error:
            return BandSpectrum(band.bandpass, band.to_dict(), None, (), (), {}, 0, str(error))

        cache_path = Path(dataset.dataset_path).parent / "spectrum" / "photometry.json"
        cache = _read_photometry(cache_path)
        lock = Lock()
        pending = [
            (index, observation)
            for index, observation in enumerate(dataset.observations)
            if observation.observation_id not in cache["points"]
            and observation.observation_id not in cache["rejected"]
        ]
        done = dataset.frame_count - len(pending)
        if on_progress:
            on_progress(done, dataset.frame_count)

        def measure(observation: ObservationRecord) -> tuple[str, Any]:
            for attempt in range(1, self.retry_attempts + 1):
                try:
                    with self._network:
                        fits_path = self._obtain_fits(
                            service, dataset, observation, output_directory.expanduser().resolve()
                        )
                    break
                except Exception:
                    if attempt == self.retry_attempts:
                        raise
                    time.sleep(self.retry_delay_seconds * attempt)
            try:
                return "point", measure_spectral_point(
                    fits_path, observation, ra_deg=dataset.ra_deg, dec_deg=dataset.dec_deg
                )
            except PhotometryRejected as error:
                return "rejected", str(error)

        failed: dict[str, str] = {}
        if pending:
            workers = min(self.download_workers, len(pending))
            with ThreadPoolExecutor(max_workers=workers) as executor:
                futures = {executor.submit(measure, obs): obs for _, obs in pending}
                for future in as_completed(futures):
                    observation = futures[future]
                    try:
                        kind, value = future.result()
                    except Exception as error:  # falha de rede: tenta de novo na próxima vez
                        kind, value = "error", f"{type(error).__name__}: {error}"[:200]
                    with lock:
                        if kind == "error":
                            failed[observation.observation_id] = value
                        if kind == "point":
                            cache["points"][observation.observation_id] = value.to_dict()
                        elif kind == "rejected":
                            cache["rejected"][observation.observation_id] = value
                        done += 1
                        if on_progress:
                            on_progress(done, dataset.frame_count)
            _write_manifest(cache_path, cache)

        points = tuple(
            sorted(
                (SpectralPoint(**item) for item in cache["points"].values()),
                key=lambda point: point.wavelength_um,
            )
        )
        outliers = flag_outliers(points)
        return BandSpectrum(
            bandpass=band.bandpass,
            band=band.to_dict(),
            request_id=dataset.request_id,
            points=points,
            outliers=tuple(sorted(outliers)),
            channels=channel_medians(points, band.bandpass, exclude=outliers),
            rejected=dict(cache["rejected"]),
            observation_count=dataset.frame_count,
            failed=failed,
        )

    def _obtain_fits(
        self,
        service: SpherexTemporalSequenceService,
        dataset: TemporalDataset,
        observation: ObservationRecord,
        root: Path,
    ) -> Path:
        """Recorte só até VARIANCE (~30 KB) + tabela WCS-WAVE em cache."""

        return obtain_cutout(
            service.irsa_client,
            observation,
            Path(dataset.dataset_path).parent / "fits",
            cutout_center=(dataset.ra_deg, dataset.dec_deg),
            cutout_size_deg=dataset.cutout_fov_arcmin / 60,
            stop_after="VARIANCE",
            store=CalibrationStore(root),
        )

    def learn_calibration(self, fits_path: Path, root: Path) -> bool:
        return CalibrationStore(root).learn(fits_path)

    def seed_calibrations(self, root: Path, *, limit: int = 400) -> int:
        return CalibrationStore(root).seed(limit=limit)

    def spectrum(
        self,
        *,
        ra_deg: float,
        dec_deg: float,
        bandpasses: Sequence[str],
        output_directory: Path,
        theme: str = "dark",
        on_progress: Callable[[str, int, int], None] | None = None,
    ) -> SpectrumResult:
        names = [get_spherex_band(name).bandpass for name in bandpasses] or [
            band.bandpass for band in SPHEREX_BANDS
        ]
        order = {band.bandpass: index for index, band in enumerate(SPHEREX_BANDS)}
        names = sorted(dict.fromkeys(names), key=order.__getitem__)
        root = output_directory.expanduser().resolve()

        with ThreadPoolExecutor(max_workers=len(names)) as executor:
            futures = {
                name: executor.submit(
                    self.band_spectrum,
                    ra_deg=ra_deg,
                    dec_deg=dec_deg,
                    bandpass=name,
                    output_directory=root,
                    on_progress=(lambda d, t, n=name: on_progress(n, d, t)) if on_progress else None,
                )
                for name in names
            }
            bands = tuple(futures[name].result() for name in names)

        coordinate = f"RA {ra_deg:.5f}° · Dec {dec_deg:+.5f}°".replace(".", ",")
        band_charts: dict[str, str] = {}
        for band in bands:
            if band.request_id is None:
                continue
            svg = render_spectrum_svg(
                [_series(band)],
                title=f"Espectro SPHEREx · {band.bandpass.replace('SPHEREx-', '')}",
                subtitle=_subtitle(coordinate, [band]),
                theme=theme,
                x_range=_padded_range(band.band),
            )
            directory = root / band.request_id / "spectrum"
            band_charts[band.bandpass] = str(_write_chart(directory, f"band-{theme}", svg))

        composite_id = sha256(
            json.dumps([SPECTRUM_VERSION, round(ra_deg, 9), round(dec_deg, 9), names]).encode()
        ).hexdigest()[:16]
        combined_svg = render_spectrum_svg(
            [_series(band) for band in bands if band.points],
            title="Espectro SPHEREx · " + " + ".join(n.replace("SPHEREx-", "") for n in names),
            subtitle=_subtitle(coordinate, bands),
            theme=theme,
            x_range=(
                min(b.band["wavelength_min_um"] for b in bands) - 0.05,
                max(b.band["wavelength_max_um"] for b in bands) + 0.05,
            ),
        )
        combined_directory = root / composite_id / "spectrum"
        combined = _write_chart(combined_directory, f"combined-{theme}", combined_svg)
        _write_manifest(
            combined_directory / "composite.json",
            {"version": SPECTRUM_VERSION, "ra_deg": ra_deg, "dec_deg": dec_deg, "bandpasses": names},
        )
        return SpectrumResult(ra_deg, dec_deg, bands, band_charts, str(combined), composite_id)


def _series(band: BandSpectrum) -> ChartSeries:
    meta = band.band
    label = (
        f"{band.bandpass.replace('SPHEREx-', '')} · "
        f"{meta['wavelength_min_um']:.3f}–{meta['wavelength_max_um']:.3f} µm"
    ).replace(".", ",")
    return ChartSeries(
        label=label,
        color=tuple(meta["display_rgb"]),
        points=[
            (p.wavelength_um, p.flux_mjy, p.flux_error_mjy, p.observation_id in band.outliers)
            for p in band.points
        ],
        line=band.channels,
    )


def _subtitle(coordinate: str, bands: Sequence[BandSpectrum]) -> str:
    measured = sum(len(band.points) for band in bands)
    total = sum(band.observation_count for band in bands)
    return (
        f"{coordinate} · {measured}/{total} observações medidas · "
        f"abertura {APERTURE_RADIUS_PX:g} px, fundo local · linha = mediana por canal"
        + (f" · {outliers} outliers vazados" if (outliers := sum(len(b.outliers) for b in bands)) else "")
    )


def _padded_range(band: dict[str, Any]) -> tuple[float, float]:
    span = band["wavelength_max_um"] - band["wavelength_min_um"]
    return band["wavelength_min_um"] - 0.03 * span, band["wavelength_max_um"] + 0.03 * span


def _write_chart(directory: Path, stem: str, svg: str) -> Path:
    """Nome com hash do conteúdo: URL imutável, cache longo no navegador."""

    digest = sha256(svg.encode("utf-8")).hexdigest()[:10]
    path = directory / f"{stem}-{digest}.svg"
    if not path.exists():
        directory.mkdir(parents=True, exist_ok=True)
        for old in directory.glob(f"{stem}-*.svg"):
            old.unlink(missing_ok=True)
        temporary = path.with_suffix(".tmp")
        temporary.write_text(svg, encoding="utf-8")
        temporary.replace(path)
    return path


def _read_photometry(path: Path) -> dict[str, Any]:
    empty = {
        "version": SPECTRUM_VERSION,
        "aperture_radius_px": APERTURE_RADIUS_PX,
        "annulus_px": list(ANNULUS_PX),
        "points": {},
        "rejected": {},
    }
    if not path.exists():
        return empty
    data = json.loads(path.read_text(encoding="utf-8"))
    if data.get("version") != SPECTRUM_VERSION:
        return empty
    return data


__all__ = [
    "BandSpectrum",
    "PhotometryRejected",
    "SpectralPoint",
    "SpectrumResult",
    "SpherexSpectrumService",
    "TemporalDataset",
    "channel_medians",
    "measure_spectral_point",
]
