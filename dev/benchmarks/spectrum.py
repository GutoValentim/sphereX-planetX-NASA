"""Compara motores e amostragem usando só FITS locais, sem tocar no acervo.

Uso e limites da comparação: README.md nesta pasta.
"""

from __future__ import annotations

import argparse
from dataclasses import replace
from hashlib import sha256
import json
from pathlib import Path
import socket
import statistics
import subprocess
import sys
from time import perf_counter
from types import ModuleType, SimpleNamespace
from unittest.mock import patch

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

from app.services import spectrum_service as current  # noqa: E402
from app.services.temporal_sequence_service import _load_dataset  # noqa: E402


def baseline_module(ref: str) -> ModuleType:
    """Carrega os dois arquivos científicos do ref, sem checkout nem escrita."""

    for name in ("image_aligner", "spectrum_service"):
        relative = f"backend/app/services/{name}.py"
        source = subprocess.check_output(
            ["git", "show", f"{ref}:{relative}"], cwd=ROOT, text=True
        )
        source = source.replace(
            "from app.services.image_aligner import", "from _baseline_image_aligner import"
        )
        module = ModuleType(f"_baseline_{name}")
        sys.modules[module.__name__] = module
        exec(compile(source, f"{ref}:{relative}", "exec"), module.__dict__)
    return module


def local_inputs(cache: Path, ra: float, dec: float, bands: list[str]) -> tuple[dict, dict]:
    datasets, paths = {}, {}
    for path in sorted(cache.glob("*/dataset.json")):
        data = json.loads(path.read_text())
        if (
            abs(data["ra_deg"] - ra) > 1e-8 or abs(data["dec_deg"] - dec) > 1e-8
            or data["bandpass"] not in bands or data["fov_arcmin"] != 3
            or data.get("cutout_fov_arcmin") != 4
        ):
            continue
        dataset = _load_dataset(path, cache_hit=True)
        if dataset.bandpass in datasets:
            raise ValueError(f"Mais de um dataset para {dataset.bandpass}: selecione outro cache.")
        datasets[dataset.bandpass] = dataset
        for obs in dataset.observations:
            # Usa o nome derivado da URL, como IrsaClient, sem chamar o cliente.
            stem = Path(obs.access_url.split("?", 1)[0]).name.removesuffix(".fits")
            files = [p for suffix in ("-cutout-variance.fits", "-cutout.fits")
                     if (p := path.parent / "fits" / f"{stem}{suffix}").is_file()]
            if not files:
                raise FileNotFoundError(f"FITS local ausente: {dataset.bandpass}/{obs.observation_id}")
            paths[(dataset.bandpass, obs.observation_id)] = files[0]
    if set(datasets) != set(bands):
        raise ValueError(f"Faltam datasets de espectro: {sorted(set(bands) - set(datasets))}")
    return datasets, paths


def offline_service(module: ModuleType, datasets: dict, paths: dict, root: Path, limit: int, workers: int):
    class OfflineSpectrum(module.SpherexSpectrumService):
        def _service(self, bandpass):
            dataset = datasets[bandpass]
            observations = dataset.observations
            if limit and len(observations) > limit:
                # Experimento temporal determinístico, não seleção por λ:
                # permite medir a perda de cobertura sem conhecer λ de antemão.
                indices = np.linspace(0, len(observations) - 1, limit, dtype=int)
                observations = tuple(observations[i] for i in indices)
            isolated = replace(
                dataset, observations=observations,
                dataset_path=str(root / dataset.request_id / "dataset.json"),
            )
            return SimpleNamespace(discover_dataset=lambda **_: isolated)

        def _obtain_fits(self, service, dataset, observation, root):
            return paths[(dataset.bandpass, observation.observation_id)]

    return OfflineSpectrum(download_workers=workers)


def channel_quality(full: dict, sampled: dict) -> list[dict]:
    result = []
    for reference, band in zip(full["bands"], sampled["bands"]):
        edges = np.geomspace(band["band"]["wavelength_min_um"], band["band"]["wavelength_max_um"], 18)
        def bins(item):
            return {int(np.searchsorted(edges, w, side="right") - 1): f for w, f in item["channels"]}
        original, reduced = bins(reference), bins(band)
        deltas = [abs(f - original[i]) for i, f in reduced.items() if i in original]
        result.append({
            "bandpass": band["bandpass"], "measured": len(band["points"]),
            "full_channels": len(original), "sampled_channels": len(reduced),
            "max_channel_delta_mjy": max(deltas, default=None),
        })
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True, help="Pasta nova, fora do cache de origem")
    parser.add_argument("--ra", type=float, required=True)
    parser.add_argument("--dec", type=float, required=True)
    parser.add_argument("--baseline-ref", default="origin/main")
    parser.add_argument("--bands", nargs="+", default=[f"D{i}" for i in range(1, 7)])
    parser.add_argument("--limits", nargs="+", type=int, default=[8, 17])
    parser.add_argument("--repeats", type=int, default=3)
    parser.add_argument("--workers", type=int, choices=range(1, 9), default=1)
    args = parser.parse_args()
    if args.repeats < 1 or any(limit < 2 for limit in args.limits):
        parser.error("repeats deve ser positivo; limites devem ser >= 2")
    cache, output = args.cache.expanduser().resolve(), args.output.expanduser().resolve()
    if output == cache or output.is_relative_to(cache) or cache.is_relative_to(output):
        parser.error("output e cache precisam ser árvores separadas")
    if output.exists():
        parser.error("output já existe; use uma pasta nova para evitar reaproveitar fotometria")
    bands = sorted({current.get_spherex_band(b if b.startswith("SPHEREx-") else f"SPHEREx-{b}").bandpass
                    for b in args.bands})
    datasets, paths = local_inputs(cache, args.ra, args.dec, bands)
    baseline = baseline_module(args.baseline_ref)
    baseline_sha = subprocess.check_output(
        ["git", "rev-parse", args.baseline_ref], cwd=ROOT, text=True
    ).strip()
    output.mkdir(parents=True)
    report = {
        "baseline_sha": baseline_sha, "cache": str(cache), "ra_deg": args.ra, "dec_deg": args.dec,
        "workers_per_band": args.workers, "repeats": args.repeats,
        "current_sources_sha256": {
            name: sha256((ROOT / f"backend/app/services/{name}.py").read_bytes()).hexdigest()
            for name in ("image_aligner", "spectrum_service")
        },
        "note": "Sem rede. Metadados e FITS locais; fotometria recalculada, cache do SO aquecido. "
                "Tempo inclui abertura dos FITS, fotometria, canais, JSON e SVG; exclui importações.",
        "runs": [],
    }
    selections = [["SPHEREx-D3"], bands] if "SPHEREx-D3" in bands and len(bands) > 1 else [bands]
    for selected in selections:
        label = "-".join(b.replace("SPHEREx-", "") for b in selected)
        configs = [("baseline", baseline, 0), ("current", current, 0)]
        configs += [("current", current, limit) for limit in dict.fromkeys(args.limits)]
        results = {}
        timings = {(name, limit): [] for name, _, limit in configs}
        # Alterna a ordem a cada repetição para reduzir viés de aquecimento.
        for repeat in range(args.repeats):
            for name, module, limit in configs[::1 if repeat % 2 == 0 else -1]:
                root = output / label / f"{name}-{limit or 'full'}" / f"trial-{repeat + 1}"
                service = offline_service(module, datasets, paths, root, limit, args.workers)
                started = perf_counter()
                with patch.object(socket.socket, "connect", side_effect=RuntimeError("Benchmark sem rede")):
                    result = service.spectrum(
                        ra_deg=args.ra, dec_deg=args.dec, bandpasses=selected, output_directory=root,
                    ).to_dict()
                seconds = perf_counter() - started
                if any(b["failed"] or b["error"] for b in result["bands"]):
                    raise RuntimeError(f"Medições falharam: {result['bands']}")
                timings[(name, limit)].append(seconds)
                previous = results.get((name, limit))
                if previous is not None and previous["bands"] != result["bands"]:
                    raise AssertionError("Resultado científico mudou entre repetições")
                results[(name, limit)] = result
                print(f"{label} {name} limit={limit or 'full'} trial={repeat + 1}: {seconds:.3f}s", flush=True)
        same = results[("baseline", 0)]["bands"] == results[("current", 0)]["bands"]
        for name, _, limit in configs:
            result = results[(name, limit)]
            run = {
                "bands": label, "engine": name, "limit_per_band": limit or None,
                "seconds": timings[(name, limit)], "median_seconds": statistics.median(timings[(name, limit)]),
                "full_result_identical": same,
                "quality": channel_quality(results[("current", 0)], result), "result": result,
            }
            report["runs"].append(run)
        if not same:
            raise AssertionError("Motor completo difere do baseline; inspecione os pontos antes de continuar")
    (output / "results.json").write_text(json.dumps(report, indent=2, ensure_ascii=False))
    lines = ["# Experimento offline de espectro", "", report["note"], "",
             f"Baseline: `{baseline_sha}`. {args.repeats} repetições; {args.workers} worker(s) por banda.", "",
             "O limite seleciona visitas espaçadas na ordem temporal; pode perder canais e épocas. "
             "O motor do produto continua medindo todas as observações.", "",
             "| Bandas | Motor | Limite/banda | Mediana (s) | Pontos | Canais ocupados | Gráfico |",
             "|---|---|---:|---:|---:|---:|---|"]
    for run in report["runs"]:
        result = run["result"]
        chart = Path(result["combined_chart"]).relative_to(output)
        lines.append(f"| {run['bands']} | {run['engine']} | {run['limit_per_band'] or 'todos'} "
                     f"| {run['median_seconds']:.3f} | {sum(q['measured'] for q in run['quality'])} "
                     f"| {sum(q['sampled_channels'] for q in run['quality'])} | [SVG]({chart}) |")
    lines += ["", "Pontos, erros, rejeições, outliers e canais do motor completo: idênticos ao baseline.",
              "Diferenças das medianas por canal e todos os pontos estão em [results.json](results.json)."]
    (output / "report.md").write_text("\n".join(lines) + "\n")
    print(f"Relatório: {output / 'report.md'}")


if __name__ == "__main__":
    main()
