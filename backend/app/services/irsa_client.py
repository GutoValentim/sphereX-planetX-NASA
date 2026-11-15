"""Consulta SIA2 e download seguro de imagens espectrais SPHEREx."""

from __future__ import annotations

from datetime import datetime
from pathlib import Path
import re
import time
from typing import Iterable
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from astropy import units as u
from astropy.coordinates import SkyCoord
from astropy.table import Table
from astropy.time import Time
from astroquery.ipac.irsa import Irsa
from pyvo.dal.exceptions import DALServiceError
import requests

from app.schemas.observations import ObservationQuery, ObservationRecord


IRSA_DOWNLOAD_HOST = "irsa.ipac.caltech.edu"
DEFAULT_MAX_DOWNLOAD_BYTES = 256 * 1024 * 1024
_SAFE_FILENAME = re.compile(r"[^A-Za-z0-9._-]+")


class IrsaClient:
    """Cliente do SIA2 limitado aos produtos de imagens espectrais SPHEREx."""

    def query_table(self, query: ObservationQuery) -> Table:
        """Executa a consulta e preserva a tabela científica retornada pelo IRSA."""

        coordinate = SkyCoord(query.ra_deg, query.dec_deg, unit="deg", frame="icrs")
        radius = query.radius_arcsec * u.arcsec
        time_range = self._time_range(query.start_time, query.end_time)

        table: Table | None = None
        for attempt in range(3):
            try:
                table = Irsa.query_sia(
                    pos=(coordinate, radius),
                    time=time_range,
                    collection=list(query.collections),
                    maxrec=query.max_records,
                )
                break
            except (DALServiceError, requests.RequestException):
                if attempt == 2:
                    raise
                time.sleep(2**attempt)

        if table is None:
            raise RuntimeError("A consulta SIA2 não retornou uma tabela.")

        if "t_min" in table.colnames and len(table):
            table.sort("t_min")
        return table

    def search(self, query: ObservationQuery) -> list[ObservationRecord]:
        """Executa a busca e converte o resultado para modelos da aplicação."""

        return self.records_from_table(self.query_table(query))

    def records_from_table(self, table: Table) -> list[ObservationRecord]:
        """Converte uma tabela SIA2 já obtida para registros serializáveis."""

        return [self._record_from_row(row) for row in table]

    def download(
        self,
        observation: ObservationRecord,
        output_directory: Path,
        *,
        cutout_center: tuple[float, float] | None = None,
        cutout_size_deg: float | None = None,
        overwrite: bool = False,
        max_bytes: int = DEFAULT_MAX_DOWNLOAD_BYTES,
    ) -> Path:
        """Baixa um FITS completo ou um cutout, com limite de tamanho."""

        url = self._validated_irsa_url(observation.access_url)
        is_cutout = cutout_center is not None or cutout_size_deg is not None
        if is_cutout:
            if cutout_center is None or cutout_size_deg is None:
                raise ValueError("cutout_center e cutout_size_deg devem ser informados juntos.")
            if not 0 < cutout_size_deg <= 1:
                raise ValueError("cutout_size_deg deve estar no intervalo (0, 1].")
            url = self._cutout_url(url, cutout_center, cutout_size_deg)

        output_directory.mkdir(parents=True, exist_ok=True)
        destination = output_directory / self._filename_for(url, is_cutout)
        if destination.exists() and not overwrite:
            return destination

        temporary = destination.with_suffix(destination.suffix + ".part")
        downloaded = 0

        try:
            with self._get_with_retry(url) as response, temporary.open("wb") as output:
                response.raise_for_status()
                self._validated_irsa_url(response.url.split("?", maxsplit=1)[0])
                content_length = response.headers.get("Content-Length")
                if content_length and int(content_length) > max_bytes:
                    raise ValueError(
                        f"Download recusado: {content_length} bytes excedem o limite de {max_bytes}."
                    )

                for chunk in response.iter_content(chunk_size=1024 * 1024):
                    if not chunk:
                        continue
                    downloaded += len(chunk)
                    if downloaded > max_bytes:
                        raise ValueError(f"Download excedeu o limite de {max_bytes} bytes.")
                    output.write(chunk)

            temporary.replace(destination)
        except Exception:
            temporary.unlink(missing_ok=True)
            raise

        return destination

    @staticmethod
    def _get_with_retry(url: str, attempts: int = 3) -> requests.Response:
        transient_statuses = {429, 500, 502, 503, 504}
        for attempt in range(attempts):
            response = requests.get(
                url,
                headers={"User-Agent": "spherex-time-explorer/0.1"},
                stream=True,
                timeout=(15, 120),
            )
            if response.status_code not in transient_statuses or attempt == attempts - 1:
                return response
            response.close()
            time.sleep(2**attempt)

        raise RuntimeError("Número inválido de tentativas de download.")

    def download_many(
        self,
        observations: Iterable[ObservationRecord],
        output_directory: Path,
        *,
        limit: int,
        cutout_center: tuple[float, float],
        cutout_size_deg: float,
        overwrite: bool = False,
    ) -> list[Path]:
        """Baixa uma quantidade limitada de cutouts de uma busca."""

        if limit <= 0:
            raise ValueError("limit deve ser maior que zero.")

        paths: list[Path] = []
        for observation in observations:
            if len(paths) == limit:
                break
            paths.append(
                self.download(
                    observation,
                    output_directory,
                    cutout_center=cutout_center,
                    cutout_size_deg=cutout_size_deg,
                    overwrite=overwrite,
                )
            )
        return paths

    @staticmethod
    def _time_range(
        start: datetime | None, end: datetime | None
    ) -> tuple[str, str] | None:
        if start is None or end is None:
            return None
        return (start.isoformat(), end.isoformat())

    @staticmethod
    def _record_from_row(row: object) -> ObservationRecord:
        return ObservationRecord(
            observation_id=_text(row, "obs_id") or "unknown-observation",
            collection=_text(row, "obs_collection") or "unknown-collection",
            access_url=_text(row, "access_url") or "",
            access_format=_text(row, "access_format"),
            estimated_size_kb=_integer(row, "access_estsize"),
            ra_deg=_number(row, "s_ra"),
            dec_deg=_number(row, "s_dec"),
            observed_at=_mjd_as_iso(row, "t_min"),
            observation_end=_mjd_as_iso(row, "t_max"),
            bandpass=_text(row, "energy_bandpassname"),
            instrument=_text(row, "instrument_name"),
            spatial_resolution_arcsec=_number(row, "s_resolution"),
            spatial_region=_text(row, "s_region"),
            field_of_view_deg=_number(row, "s_fov"),
            pixel_scale_arcsec=_number(row, "s_pixel_scale"),
            exposure_seconds=_number(row, "t_exptime"),
        )

    @staticmethod
    def _validated_irsa_url(url: str) -> str:
        parsed = urlsplit(url)
        if parsed.scheme != "https" or parsed.hostname != IRSA_DOWNLOAD_HOST:
            raise ValueError("A URL de download deve usar HTTPS no domínio oficial do IRSA.")
        if not parsed.path.lower().endswith(".fits"):
            raise ValueError("A URL de download não aponta para um arquivo FITS.")
        return url

    @staticmethod
    def _cutout_url(url: str, center: tuple[float, float], size_deg: float) -> str:
        ra_deg, dec_deg = center
        if not 0 <= ra_deg < 360 or not -90 <= dec_deg <= 90:
            raise ValueError("Centro do cutout possui coordenadas inválidas.")

        parsed = urlsplit(url)
        parameters = dict(parse_qsl(parsed.query, keep_blank_values=True))
        parameters.update({"center": f"{ra_deg:.9f},{dec_deg:.9f}", "size": f"{size_deg:g}"})
        return urlunsplit(parsed._replace(query=urlencode(parameters)))

    @staticmethod
    def _filename_for(url: str, is_cutout: bool) -> str:
        basename = Path(urlsplit(url).path).name
        safe_name = _SAFE_FILENAME.sub("_", basename)
        if is_cutout:
            return f"{Path(safe_name).stem}-cutout.fits"
        return safe_name


def _value(row: object, column: str) -> object | None:
    try:
        value = row[column]  # type: ignore[index]
    except (IndexError, KeyError, TypeError):
        return None
    if bool(getattr(value, "mask", False)):
        return None
    return value


def _text(row: object, column: str) -> str | None:
    value = _value(row, column)
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _number(row: object, column: str) -> float | None:
    value = _value(row, column)
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _integer(row: object, column: str) -> int | None:
    number = _number(row, column)
    return int(number) if number is not None else None


def _mjd_as_iso(row: object, column: str) -> str | None:
    mjd = _number(row, column)
    if mjd is None:
        return None
    return Time(mjd, format="mjd").isot
