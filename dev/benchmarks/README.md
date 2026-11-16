# Spectrum performance experiments

`spectrum.py` compares worktree photometry with `image_aligner.py` and `spectrum_service.py` from a Git revision. It reuses only existing spectrum metadata and FITS files (3′ FOV, 4′ cutout). It does not start the lab, contact IRSA, or write to the source cache. Results go into a new directory outside the original archive. Frozen engines and their records remain unchanged.

Run from the repository root using the scientific Python environment:

```sh
<venv>/bin/python dev/benchmarks/spectrum.py \
  --cache "<existing cache>" \
  --output backend/cache/spectrum-experiment-01 \
  --ra 133.795129167 --dec -7.245147222 \
  --baseline-ref dbc0a8dc72ac82260230a4d4322e005aaeba0caa \
  --workers 1 --repeats 3 --limits 8 17
```

`report.md` contains timings and SVG links for D3 and selected bands (`--bands D1 D2 D3 D4 D5 D6`, the default). `results.json` includes timings, points, uncertainties, rejections, outliers, channels, and channel-median differences. The script requires the full engine to preserve baseline results exactly and repeat them consistently across runs. It records the baseline SHA and hashes of both current source files.

The two baseline files load in isolated modules. Discovery and FITS access are replaced with local inputs, with sockets blocked. Remaining infrastructure comes from the worktree. Choose the revision immediately preceding the experiment, with compatible contracts for the other modules.

Each run starts with an empty photometry directory. Timing includes FITS reads, photometry, medians/outliers, JSON, and SVG; it excludes imports, metadata queries, and downloads. The operating-system file cache stays warm. Scenario order alternates between repetitions. `--workers 1` compares local computation with limited concurrency, although there is still one thread per band; `--workers 8` uses the service's default concurrency of up to eight tasks per band. These timings do not estimate network latency for new coordinates.

## What is compared

The full engine now evaluates spectral WCS only at the four pixels used for target bilinear interpolation. Alternate WCS W receives only its own keys and image dimensions. The former path evaluated the full grid and serialized metadata unrelated to the spectral solution. Float32 precision and interpolation are unchanged.

Photometry converts and masks only the background-annulus window (10 px outer radius), preserving every aperture/annulus pixel. Large images read only that section of IMAGE/VARIANCE. For images up to 64×64, contiguous reads avoid FITS section per-row seeks. Aperture, background, variance, and observation count are unchanged; no photometry-format version bump was needed. Lab code hashing allows freezing the engine as a new version without changing older versions.

`--limits` is a separate experiment: it selects visits evenly in dataset time order before measurement, without using known wavelengths. Fewer visits may leave spectral gaps and lose temporal variation. This selection was not added to the API or product mapping.

## First local measurement — November 15, 2026

Reference: `dbc0a8d` (`main`). Target RA 133.795129167°, Dec −7.245147222°. There were 258 observations: 257 valid points and one D6 rejection. Three repetitions, one worker per band, no network:

| Scenario | D3 | D1–D6 | D1–D6 points | Populated D1–D6 channels |
|---|---:|---:|---:|---:|
| Baseline, all visits | 0.916 s | 5.411 s | 257 | 101 |
| Optimized, all visits | 0.595 s | 3.998 s | 257 | 101 |
| Optimized, up to 17 visits/band | 0.248 s | 1.667 s | 102 | 67 |
| Optimized, up to 8 visits/band | 0.108 s | 0.713 s | 48 | 38 |

Full optimization reduced D3 time by 35% and all-band time by 26%, with identical points, uncertainties, rejections, outliers, medians, and SVG contents. There can be 102 channels, 17 per band, but D5 already had only 16 populated channels in the baseline.

Limiting visits is faster but loses coverage: 17 visits/band preserved 67/101 channels, and eight preserved 38/101. Remaining-channel medians can also change. A 17-visit limit does not guarantee 17 channels. The next visit-reduction experiment should target wavelength coverage without conflating epochs or assuming temporal sampling is spectral sampling.

Artifacts are in `backend/cache/spectrum-performance/run-1/`, ignored by Git. The script allows repeating the measurement on another machine or target.

With eight workers per band (service default), another three-repetition comparison measured D3 at 0.898 → 0.631 s and D1–D6 at 5.533 → 3.879 s: approximately 30% less time, again with identical complete results. Artifacts: `backend/cache/spectrum-performance/workers-8/`.
