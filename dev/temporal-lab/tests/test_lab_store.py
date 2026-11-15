"""Testes do armazenamento do laboratório (sem rede, sem backend científico)."""

from __future__ import annotations

import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import lab_store  # noqa: E402
from lab_store import (  # noqa: E402
    CacheIndex,
    EngineRegistry,
    RecordStore,
    compute_coverage,
    coordinate_key,
    export_record,
)

VARIANTS = ["limpa-color", "limpa-mono"]


def make_source(root: Path, body: str = "VALUE = 1\n") -> None:
    (root / "backend" / "app" / "services").mkdir(parents=True)
    (root / "backend" / "app" / "__init__.py").write_text("")
    (root / "backend" / "app" / "services" / "engine.py").write_text(body)
    (root / "dev" / "temporal-lab").mkdir(parents=True)
    (root / "dev" / "temporal-lab" / "engine_server.py").write_text("print('engine')\n")


def write(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data) if not isinstance(data, str) else data)


def observations(count: int) -> list[dict]:
    return [
        {"observation_id": f"obs{i}", "observed_at": f"2025-05-{i + 1:02d}T00:00:00"}
        for i in range(count)
    ]


def image_dataset(cache: Path, dataset_id: str, band: str, total: int, rendered: dict[str, int], fits: int):
    directory = cache / dataset_id
    write(directory / "dataset.json", {
        "request_id": dataset_id, "ra_deg": 10.0, "dec_deg": -5.0, "fov_arcmin": 30.0,
        "pixel_scale_arcsec": 6.15, "bandpass": band, "observations": observations(total),
    })
    variants = {}
    for variant, count in rendered.items():
        frames = {}
        for i in range(count):
            relative = f"frames/{variant}/{i + 1:03d}_obs{i}.webp"
            write(directory / relative, "webp")
            frames[f"obs{i}"] = {"relative_path": relative, "frame": {"width": 293, "height": 293}}
        variants[variant] = {"display_min": 0, "display_max": 1, "frames": frames}
    write(directory / "frame-cache.json", {"processing_version": 8, "common_grid": None, "variants": variants})
    for i in range(fits):
        write(directory / "fits" / f"obs{i}.fits", "x")


def spectrum_dataset(cache: Path, dataset_id: str, band: str, total: int, measured: int, chart: bool):
    directory = cache / dataset_id
    write(directory / "dataset.json", {
        "request_id": dataset_id, "ra_deg": 10.0, "dec_deg": -5.0, "fov_arcmin": 3.0,
        "bandpass": band, "observations": observations(total),
    })
    write(directory / "spectrum" / "photometry.json", {
        "version": 1, "points": {f"obs{i}": {} for i in range(measured)}, "rejected": {},
    })
    if chart:
        write(directory / "spectrum" / "band-dark-abc.svg", "<svg/>")


class EngineRegistryTests(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.root = Path(tmp.name)
        self.source = self.root / "repo"
        make_source(self.source)
        self.data = self.root / "data"

    def test_initial_engine_snapshots_code_and_is_immutable(self):
        registry = EngineRegistry(self.data, self.source, "a" * 40)
        registry.ensure_initial()
        engine = registry.get("v1")
        self.assertTrue(engine["is_current_code"])
        snapshot = registry.code_dir("v1") / "backend" / "app" / "services" / "engine.py"
        self.assertEqual(snapshot.read_text(), "VALUE = 1\n")
        self.assertTrue((registry.code_dir("v1") / "dev" / "temporal-lab" / "engine_server.py").is_file())

        (self.source / "backend" / "app" / "services" / "engine.py").write_text("VALUE = 2\n")
        updated = EngineRegistry(self.data, self.source, "b" * 40)
        self.assertFalse(updated.has_current_code())
        self.assertFalse(updated.get("v1")["is_current_code"])
        self.assertEqual(snapshot.read_text(), "VALUE = 1\n")

        v2 = updated.create("Espectro rápido", "menos pontos")
        self.assertEqual(v2["id"], "v2")
        self.assertEqual(v2["git_sha"], "b" * 40)
        self.assertEqual(updated.default_id(), "v2")
        self.assertEqual(
            (updated.code_dir("v2") / "backend" / "app" / "services" / "engine.py").read_text(),
            "VALUE = 2\n",
        )
        with self.assertRaises(ValueError):
            updated.create("Duplicada")

    def test_update_title_and_description(self):
        registry = EngineRegistry(self.data, self.source, None)
        registry.ensure_initial()
        engine = registry.update("v1", title="v1 renomeado", description="nota")
        self.assertEqual(engine["title"], "v1 renomeado")
        self.assertEqual(engine["description"], "nota")
        with self.assertRaises(ValueError):
            registry.update("v1", title="  ", description=None)
        with self.assertRaises(ValueError):
            registry.get("../v1")

    def test_legacy_cache_is_linked_to_first_engine(self):
        legacy = self.root / "legacy"
        legacy.mkdir()
        registry = EngineRegistry(self.data, self.source, None)
        registry.ensure_initial(legacy)
        self.assertEqual(registry.cache_dir("v1").resolve(), legacy.resolve())


class RecordStoreTests(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.store = RecordStore(Path(tmp.name))

    def test_upsert_keeps_identity_by_coordinates(self):
        first = self.store.upsert(83.8221, -5.3911, name="M42", description="Órion")
        second = self.store.upsert("83.82210000001", "-5.3911", name="", description=None)
        self.assertEqual(first["id"], second["id"])
        self.assertEqual(second["name"], "M42")
        self.assertEqual(len(self.store.list()), 1)

        edited = self.store.update(first["id"], name="Nebulosa de Órion", description="")
        self.assertEqual(edited["name"], "Nebulosa de Órion")
        self.assertEqual(edited["description"], "")
        self.assertTrue(self.store.delete(first["id"]))
        self.assertEqual(self.store.list(), [])

    def test_invalid_coordinates_and_ids(self):
        with self.assertRaises(ValueError):
            self.store.upsert(360, 0)
        with self.assertRaises(ValueError):
            self.store.upsert(10, 91)
        with self.assertRaises(ValueError):
            self.store.get("../../etc")


class CoverageTests(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.cache = Path(tmp.name) / "cache"
        self.cache.mkdir()
        self.record = {"id": "abc123abc123", "ra_deg": 10.0, "dec_deg": -5.0, "mapping": {}}

    def entry(self):
        return CacheIndex(self.cache).scan().get(coordinate_key(10.0, -5.0))

    def test_complete_partial_and_unavailable(self):
        image_dataset(self.cache, "a" * 16, "SPHEREx-D1", 3, {"limpa-color": 3, "limpa-mono": 3}, 3)
        image_dataset(self.cache, "b" * 16, "SPHEREx-D2", 4, {"limpa-color": 2}, 2)
        spectrum_dataset(self.cache, "c" * 16, "SPHEREx-D1", 10, 10, True)
        self.record["mapping"]["v1"] = {
            "status": "partial",
            "plan": {
                "bands": ["SPHEREx-D1", "SPHEREx-D2", "SPHEREx-D3"],
                "configs": [{"fov_arcmin": 30.0, "sampling": "native"}],
                "spectrum": True,
            },
            "unavailable": {"images:30-native": ["SPHEREx-D3"], "spectrum": ["SPHEREx-D3"]},
            "errors": [{"bandpass": "SPHEREx-D2", "step": "imagens", "error": "HTTP 502"}],
        }
        coverage = compute_coverage(self.record, self.entry(), "v1", VARIANTS)
        config = coverage["images"]["configs"][0]
        self.assertEqual(config["bands"]["SPHEREx-D1"]["status"], "complete")
        self.assertEqual(config["bands"]["SPHEREx-D2"]["status"], "error")
        self.assertEqual(config["bands"]["SPHEREx-D2"]["percent"], 25.0)
        self.assertEqual(config["bands"]["SPHEREx-D3"]["status"], "unavailable")
        self.assertEqual(config["percent"], 62.5)
        spectrum = coverage["spectrum"]
        self.assertEqual(spectrum["bands"]["SPHEREx-D1"]["status"], "complete")
        self.assertEqual(spectrum["bands"]["SPHEREx-D2"]["status"], "error")
        self.assertEqual(spectrum["percent"], 50.0)
        self.assertEqual(coverage["status"], "error")

    def test_everything_rendered_is_complete(self):
        image_dataset(self.cache, "a" * 16, "SPHEREx-D1", 2, {"limpa-color": 2, "limpa-mono": 2}, 2)
        spectrum_dataset(self.cache, "c" * 16, "SPHEREx-D1", 5, 5, True)
        coverage = compute_coverage(self.record, self.entry(), "v1", VARIANTS)
        self.assertEqual(coverage["status"], "complete")
        self.assertEqual(coverage["percent"], 100.0)

    def test_plan_defines_overall_status_but_extra_configs_stay_visible(self):
        image_dataset(self.cache, "a" * 16, "SPHEREx-D1", 2, {"limpa-color": 2, "limpa-mono": 2}, 2)
        image_dataset(self.cache, "b" * 16, "SPHEREx-D2", 2, {"limpa-color": 1}, 1)
        directory = self.cache / ("d" * 16)
        image_dataset(self.cache, "d" * 16, "SPHEREx-D1", 2, {"limpa-color": 1}, 1)
        dataset = json.loads((directory / "dataset.json").read_text())
        dataset["fov_arcmin"] = 10.0
        (directory / "dataset.json").write_text(json.dumps(dataset))
        self.record["mapping"]["v1"] = {
            "status": "completed",
            "plan": {"bands": ["SPHEREx-D1"], "configs": [{"fov_arcmin": 30.0, "sampling": "native"}],
                     "spectrum": False},
        }
        coverage = compute_coverage(self.record, self.entry(), "v1", VARIANTS)
        by_key = {config["key"]: config for config in coverage["images"]["configs"]}
        self.assertEqual(set(by_key), {"30-native", "10-native"})
        self.assertIn("SPHEREx-D2", by_key["30-native"]["bands"])  # descoberta fora do plano continua visível
        self.assertFalse(by_key["10-native"]["planned"])
        self.assertEqual(coverage["basis"], "plan")
        self.assertEqual(by_key["30-native"]["plan_percent"], 100.0)
        self.assertLess(by_key["30-native"]["percent"], 100.0)
        self.assertEqual(coverage["status"], "complete")  # D2 avulsa não impede o 100% do plano

    def test_spectrum_without_chart_is_not_complete(self):
        spectrum_dataset(self.cache, "c" * 16, "SPHEREx-D1", 5, 5, False)
        coverage = compute_coverage(self.record, self.entry(), "v1", VARIANTS)
        band = coverage["spectrum"]["bands"]["SPHEREx-D1"]
        self.assertEqual(band["status"], "partial")
        self.assertEqual(band["percent"], 99.0)

    def test_running_and_empty(self):
        self.assertEqual(compute_coverage(self.record, None, "v1", VARIANTS)["status"], "empty")
        self.record["mapping"]["v1"] = {"status": "running", "plan": {"bands": [], "configs": []}}
        self.assertEqual(compute_coverage(self.record, None, "v1", VARIANTS)["status"], "running")


class ExportTests(unittest.TestCase):
    def test_export_links_frames_and_writes_index(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            cache = root / "cache"
            image_dataset(cache, "a" * 16, "SPHEREx-D3", 2, {"limpa-color": 2}, 2)
            image_dataset(cache, "b" * 16, "SPHEREx-D1", 2, {"limpa-color": 1}, 1)
            write(cache / ("c" * 16) / "spectrum" / "combined-dark-x.svg", "<svg/>")
            record = {"id": "abc123abc123", "name": "Aglomerado M67", "description": "teste",
                      "ra_deg": 10.0, "dec_deg": -5.0}
            entry = CacheIndex(cache).scan()[coordinate_key(10.0, -5.0)]
            spectrum = {"dark": {"combined_chart_url": f"/cache/{'c' * 16}/spectrum/combined-dark-x.svg",
                                 "bands": []}}
            result = export_record(record, {"id": "v1", "title": "Motor"}, cache, entry, spectrum, root / "exports")

            target = root / "exports" / "v1" / result["slug"]
            self.assertEqual(result["slug"], "aglomerado-m67-abc123")
            manifest = json.loads((target / "manifest.json").read_text())
            sequence = manifest["sequences"][0]
            self.assertEqual(sequence["anchor_bandpass"], "SPHEREx-D3")
            self.assertEqual(sequence["bandpasses"], ["SPHEREx-D3"])
            self.assertEqual(sequence["omitted_bandpasses"], ["SPHEREx-D1"])  # D1: 1 de 2 frames
            first_layer = sequence["frames"][0]["layers"][0]
            self.assertTrue((target / first_layer["image_url"]).is_file())
            self.assertEqual(manifest["spectrum"]["dark"]["combined_chart_url"], "spectrum/dark/combined.svg")
            self.assertTrue((target / "spectrum" / "dark" / "combined.svg").is_file())
            index = json.loads((root / "exports" / "v1" / "index.json").read_text())
            self.assertEqual(index["targets"][0]["name"], "Aglomerado M67")

            record["name"] = "M67"
            export_record(record, {"id": "v1", "title": "Motor"}, cache, entry, {}, root / "exports")
            folders = sorted(p.name for p in (root / "exports" / "v1").iterdir() if p.is_dir())
            self.assertEqual(folders, ["m67-abc123"])

    def test_slugify(self):
        self.assertEqual(lab_store.slugify("Nebulosa de Órion (M42)"), "nebulosa-de-orion-m42")
        self.assertEqual(lab_store.slugify("★"), "alvo")


if __name__ == "__main__":
    unittest.main()
