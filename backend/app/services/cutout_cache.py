"""Recortes SPHEREx leves + tabela WCS-WAVE em cache por calibração de detector.

Um cutout traz, em ordem: IMAGE, FLAGS, VARIANCE, ZODI, EPSF (~3,9 MB de
modelos de PSF) e por fim WCS-WAVE. A tabela WCS-WAVE é uma calibração por
detector (identificada por ``[CALIB] spectral_wcs <uuid>`` no cabeçalho da
IMAGE). Guardando-a uma vez, basta baixar o início do arquivo:
IMAGE (~0,8 MB num recorte de 45′) para imagens, ou até VARIANCE (~30 KB num
recorte de 4′) para fotometria.
"""

from __future__ import annotations

from pathlib import Path
import re
from threading import Lock
from typing import Any

from astropy.io import fits

from app.schemas.observations import ObservationRecord


_SPECTRAL_WCS_ID = re.compile(r"\[CALIB\]\s+spectral_wcs\s+(\S+)")
_SAFE_ID = re.compile(r"[^A-Za-z0-9._-]+")
_LOCKS: dict[tuple[str, str, str], Lock] = {}
_LOCKS_GUARD = Lock()
DETECTOR_COUNT = 6


def spectral_wcs_id(header: fits.Header) -> str | None:
    for entry in header.get("HISTORY", []):
        match = _SPECTRAL_WCS_ID.search(str(entry))
        if match:
            return match.group(1)
    return None


class CalibrationStore:
    """Tabelas WCS-WAVE em ``<root>/calibration`` por (detector, uuid)."""

    def __init__(self, root: Path) -> None:
        self.root = root.expanduser().resolve()

    def path(self, detector: str, calibration: str) -> Path:
        return self.root / "calibration" / (
            f"wcs-wave-d{_SAFE_ID.sub('_', detector)}-{_SAFE_ID.sub('_', calibration)}.fits"
        )

    def lock(self, detector: str, calibration: str) -> Lock:
        with _LOCKS_GUARD:
            return _LOCKS.setdefault((str(self.root), detector, calibration), Lock())

    def learn(self, fits_path: Path) -> bool:
        """Guarda a tabela de um recorte completo; True se for nova."""

        with fits.open(fits_path) as hdus:
            if "IMAGE" not in hdus or "WCS-WAVE" not in hdus:
                return False
            header = hdus["IMAGE"].header
            detector = str(header.get("DETECTOR", ""))
            calibration = spectral_wcs_id(header)
            if not detector or calibration is None:
                return False
            path = self.path(detector, calibration)
            if path.exists():
                return False
            path.parent.mkdir(parents=True, exist_ok=True)
            temporary = path.with_suffix(".tmp")
            fits.HDUList([fits.PrimaryHDU(), hdus["WCS-WAVE"].copy()]).writeto(
                temporary, overwrite=True
            )
            temporary.replace(path)
            return True

    def seed(self, *, limit: int = 400) -> int:
        """Aprende calibrações a partir de recortes completos já em cache."""

        learned = 0
        detectors: set[str] = set()
        for index, path in enumerate(sorted(self.root.glob("*/fits/*-cutout.fits"))):
            if index >= limit or len(detectors) >= DETECTOR_COUNT:
                break
            try:
                detector = str(fits.getval(path, "DETECTOR", extname="IMAGE"))
                if detector in detectors:
                    continue
                learned += self.learn(path)
                detectors.add(detector)
            except (OSError, KeyError, ValueError):
                continue
        return learned


def obtain_cutout(
    client: Any,
    observation: ObservationRecord,
    directory: Path,
    *,
    cutout_center: tuple[float, float],
    cutout_size_deg: float,
    stop_after: str,
    store: CalibrationStore,
    overwrite: bool = False,
) -> Path:
    """FITS com as HDUs até ``stop_after`` + WCS-WAVE; recorte completo se necessário."""

    options = {"cutout_center": cutout_center, "cutout_size_deg": cutout_size_deg}
    if not hasattr(client, "download_hdus"):
        return client.download(observation, directory, overwrite=overwrite, **options)

    lite = client.download_hdus(
        observation, directory, stop_after=stop_after, overwrite=overwrite, **options
    )
    with fits.open(lite) as hdus:
        if "WCS-WAVE" in hdus:
            return lite
        header = hdus["IMAGE"].header
        detector = str(header.get("DETECTOR", ""))
        calibration = spectral_wcs_id(header)
    if not detector or calibration is None:
        return client.download(observation, directory, overwrite=overwrite, **options)

    table_path = store.path(detector, calibration)
    with store.lock(detector, calibration):
        if not table_path.exists():
            full = client.download(observation, directory, overwrite=overwrite, **options)
            store.learn(full)
            return full

    with fits.open(lite) as hdus, fits.open(table_path) as table:
        combined = fits.HDUList([hdu.copy() for hdu in hdus] + [table["WCS-WAVE"].copy()])
        temporary = lite.with_suffix(".tmp")
        combined.writeto(temporary, overwrite=True)
    temporary.replace(lite)
    return lite
