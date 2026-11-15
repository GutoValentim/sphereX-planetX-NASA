from __future__ import annotations

import os
from pathlib import Path
import tempfile
import unittest
from unittest import mock

from fastapi.testclient import TestClient

from app.main import create_app, release_version
from app.schemas.observations import ObservationRecord
from app.services.temporal_sequence_service import SequenceLimitExceeded, TemporalDataset


def make_dataset(ra: float, dec: float) -> TemporalDataset:
    observation = ObservationRecord(
        observation_id="obs-1",
        collection="spherex_dr1",
        access_url="https://irsa.ipac.caltech.edu/ibe/data/spherex/obs-1.fits",
        access_format="image/fits",
        estimated_size_kb=1024,
        ra_deg=ra,
        dec_deg=dec,
        observed_at="2025-07-16T00:00:00",
        observation_end=None,
        bandpass="SPHEREx-D3",
        instrument="SPHEREx",
        spatial_resolution_arcsec=6.2,
    )
    return TemporalDataset(
        request_id="0123456789abcdef",
        ra_deg=ra,
        dec_deg=dec,
        fov_arcmin=30.0,
        cutout_fov_arcmin=45.0,
        bandpass="SPHEREx-D3",
        collections=("spherex_dr1", "spherex_qr3"),
        source_observation_count=5,
        band_observation_count=2,
        observations=(observation,),
        discovered_at="2026-11-15T00:00:00+00:00",
        cache_hit=False,
        dataset_path="/cache/temporal/0123456789abcdef/dataset.json",
    )


class FakeService:
    """Falha com cada erro de ``errors`` em sequência; ``always`` falha sempre."""

    def __init__(self, error: Exception | None = None, *, errors: list[Exception] | None = None) -> None:
        self.always = error
        self.errors = list(errors or [])
        self.calls: list[dict] = []

    def discover_dataset(self, *, ra_deg: float, dec_deg: float, output_directory: Path):
        self.calls.append({"ra_deg": ra_deg, "dec_deg": dec_deg, "output_directory": output_directory})
        if self.always:
            raise self.always
        if self.errors:
            raise self.errors.pop(0)
        return make_dataset(ra_deg, dec_deg)


class PythonApiTests(unittest.TestCase):
    def client(self, service: FakeService) -> TestClient:
        return TestClient(
            create_app(
                service=service,
                cache_dir=Path("/tmp/spherex-test-cache"),
                retry_delay_seconds=0,
            )
        )

    def test_healthz_reports_release_version(self) -> None:
        with mock.patch.dict(os.environ, {"GIT_SHA": "a" * 40}):
            response = self.client(FakeService()).get("/healthz")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(), {"status": "ok", "service": "spherex-python", "version": "a" * 40}
        )

    def test_release_version_reads_release_env_file(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / ".release.env"
            path.write_text("GIT_SHA=" + "b" * 40 + "\n")
            env = {"SPHEREX_RELEASE_ENV": str(path)}
            with mock.patch.dict(os.environ, env, clear=True):
                self.assertEqual(release_version(), "b" * 40)

    def test_receber_dados_returns_observations_without_internal_paths(self) -> None:
        service = FakeService()
        response = self.client(service).post(
            "/receber-dados", json={"RA": 133.79513, "DEC": -7.24515, "Data": "2026-11-14"}
        )
        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertEqual(body["consulta"], {"RA": 133.79513, "DEC": -7.24515, "Data": "2026-11-14"})
        self.assertEqual(body["frame_count"], 1)
        self.assertEqual(body["observations"][0]["observation_id"], "obs-1")
        self.assertNotIn("dataset_path", body)
        self.assertEqual(service.calls[0]["ra_deg"], 133.79513)
        self.assertEqual(service.calls[0]["output_directory"], Path("/tmp/spherex-test-cache"))

    def test_invalid_coordinates_return_400_in_portuguese(self) -> None:
        service = FakeService()
        response = self.client(service).post("/receber-dados", json={"RA": 400, "DEC": 0})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["erro"], "Parâmetros inválidos.")
        self.assertEqual(response.json()["detalhes"][0]["campo"], "RA")
        self.assertEqual(service.calls, [])

    def test_transient_irsa_failures_are_retried(self) -> None:
        service = FakeService(errors=[ConnectionError("timeout"), ConnectionError("503")])
        with self.assertLogs("spherex.python", "WARNING"):
            response = self.client(service).post("/receber-dados", json={"RA": 10, "DEC": -5})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(len(service.calls), 3)

    def test_domain_errors_are_not_retried(self) -> None:
        service = FakeService(LookupError("Sem cobertura."))
        response = self.client(service).post("/receber-dados", json={"RA": 10, "DEC": -5})
        self.assertEqual(response.status_code, 404)
        self.assertEqual(len(service.calls), 1)

    def test_service_errors_map_to_http_statuses(self) -> None:
        cases = [
            (LookupError("Nenhuma observação cobre a região."), 404),
            (SequenceLimitExceeded(150, 100), 422),
            (ValueError("Coleção inválida."), 400),
            (ConnectionError("IRSA fora do ar"), 502),
        ]
        for error, status in cases:
            with self.subTest(error=type(error).__name__):
                with self.assertLogs("spherex.python", "ERROR") if status == 502 else _noop():
                    response = self.client(FakeService(error)).post(
                        "/receber-dados", json={"RA": 10, "DEC": -5}
                    )
                self.assertEqual(response.status_code, status)
                self.assertIn("erro", response.json())


class _noop:
    def __enter__(self) -> None:
        return None

    def __exit__(self, *_exc: object) -> None:
        return None


if __name__ == "__main__":
    unittest.main()


class FakeSpectrumService:
    """Grava SVGs no cache como o serviço real e devolve um SpectrumResult."""

    def __init__(self, root: Path) -> None:
        self.root = root
        self.calls: list[dict] = []

    def spectrum(self, *, ra_deg, dec_deg, bandpasses, output_directory, theme, on_progress=None):
        from app.services.spectrum_service import BandSpectrum, SpectrumResult
        from app.services.spectral_color import get_spherex_band

        self.calls.append({"bandpasses": list(bandpasses), "theme": theme})
        combined = output_directory / "0123456789abcdef" / "spectrum" / "combined-dark-aa.svg"
        combined.parent.mkdir(parents=True, exist_ok=True)
        combined.write_text("<svg xmlns='http://www.w3.org/2000/svg'/>", encoding="utf-8")
        bands = []
        for name in bandpasses:
            if on_progress:
                on_progress(name, 1, 1)
            bands.append(BandSpectrum(name, get_spherex_band(name).to_dict(), "fedcba9876543210", (), (), {}, 1))
        return SpectrumResult(ra_deg, dec_deg, tuple(bands), {}, str(combined), "0123456789abcdef")


class SpectrumApiTests(unittest.TestCase):
    def setUp(self) -> None:
        from app.services.spectrum_jobs import SpectrumJobManager

        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.cache = Path(self.tmp.name)
        self.service = FakeSpectrumService(self.cache)
        jobs = SpectrumJobManager(
            self.service,
            self.cache,
            lambda path: "/espectros/arquivos/" + path.resolve().relative_to(self.cache.resolve()).as_posix(),
        )
        self.client = TestClient(create_app(service=FakeService(), cache_dir=self.cache, spectrum_jobs=jobs))

    def wait(self, status_url: str) -> dict:
        import time

        for _ in range(100):
            body = self.client.get(status_url).json()
            if body["status"] != "running":
                return body
            time.sleep(0.02)
        self.fail("job não terminou")

    def test_spectrum_element_starts_job_and_serves_the_chart(self) -> None:
        response = self.client.post(
            "/receber-dados",
            json={"RA": 10, "DEC": -5, "Data": "2026-11-14", "elemento": "espectro", "bandas": ["d3", "SPHEREx-D1"], "tema": "claro"},
        )
        self.assertIn(response.status_code, (200, 202))
        body = response.json()
        self.assertEqual(body["elemento"], "espectro")
        self.assertEqual(body["consulta"]["bandas"], ["SPHEREx-D3", "SPHEREx-D1"])
        self.assertTrue(body["status_url"].startswith("/espectros/"))

        done = self.wait(body["status_url"])
        self.assertEqual(done["status"], "completed", done)
        self.assertEqual(self.service.calls[0]["theme"], "light")
        url = done["result"]["combined_chart_url"]
        self.assertEqual(url, "/espectros/arquivos/0123456789abcdef/spectrum/combined-dark-aa.svg")
        chart = self.client.get(url)
        self.assertEqual(chart.status_code, 200)
        self.assertEqual(chart.headers["content-type"], "image/svg+xml")
        self.assertIn("immutable", chart.headers["cache-control"])

    def test_default_element_is_still_the_image_metadata(self) -> None:
        response = self.client.post("/receber-dados", json={"RA": 10, "DEC": -5})
        self.assertEqual(response.status_code, 200)
        self.assertIn("observations", response.json())
        self.assertEqual(self.service.calls, [])

    def test_all_bands_by_default_and_invalid_bands_rejected(self) -> None:
        body = self.client.post("/receber-dados", json={"RA": 10, "DEC": -5, "elemento": "espectro"}).json()
        self.assertEqual(len(body["consulta"]["bandas"]), 6)
        bad = self.client.post("/receber-dados", json={"RA": 10, "DEC": -5, "elemento": "espectro", "bandas": ["D7"]})
        self.assertEqual(bad.status_code, 400)
        self.assertIn("Banda", bad.json()["erro"])
        wrong = self.client.post("/receber-dados", json={"RA": 10, "DEC": -5, "elemento": "video"})
        self.assertEqual(wrong.status_code, 400)

    def test_status_and_files_reject_unknown_or_unsafe_paths(self) -> None:
        self.assertEqual(self.client.get("/espectros/zzz").status_code, 400)
        self.assertEqual(self.client.get("/espectros/0123456789abcdef").status_code, 404)
        (self.cache / "secret.svg").write_text("x")
        for path in (
            "/espectros/arquivos/../secret.svg",
            "/espectros/arquivos/0123456789abcdef/spectrum/..%2F..%2Fsecret.svg",
            "/espectros/arquivos/0123456789abcdef/fits/x.fits",
        ):
            with self.subTest(path=path):
                response = self.client.get(path)
                self.assertIn(response.status_code, (400, 404))  # nunca serve o arquivo
                self.assertNotEqual(response.headers["content-type"], "image/svg+xml")
