# SPHEREx Lab

Laboratory for mapping known targets (constellations, regions, familiar stars) and storing everything the product needs: FITS files, images in every rendering variant, and spectra. Published at <https://lab.spherex.prospectordigital.com.br> with HTTP Basic authentication; also runs locally. It is separate from the product frontend.

## Architecture

```text
browser --> server.py (gateway :8765)
               +-- interface (public/), records, mapping queue, exports
               +--> v1 engine: engines/v1/code/dev/temporal-lab/engine_server.py (127.0.0.1:8801)
               +--> v2 engine: engines/v2/code/...                             (127.0.0.1:8802)
```

- `server.py`: gateway. Serves UI, authenticates, stores records, calculates disk-based coverage, runs the mapping queue, exports targets.
- `engine_server.py`: scientific API (sequences, prefetching, spectra). Each **engine version** runs it from a frozen `backend/app` + `engine_server.py` copy, in its own subprocess with its own cache.
- `lab_store.py`: engine, record, coverage, and export persistence, without scientific dependencies. Tests are in `tests/`.

### Data directory (`SPHEREX_LAB_DATA_DIR`)

| Path | Contents |
|---|---|
| `engines/<v>/engine.json` | Title, description, commit, frozen-code hash |
| `engines/<v>/code/` | Copy of `backend/app/**/*.py` and `engine_server.py` |
| `engines/<v>/cache/` | Datasets, FITS, aligned arrays, WebPs, spectra, `calibration/` |
| `engines/<v>/results/<record>/` | Spectrum summary in dark/light themes |
| `records/<id>.json` | Target name, description, RA/Dec, mapping plan/state |
| `exports/<v>/index.json` | Exported-target catalog |
| `exports/<v>/<slug>/` | `manifest.json` + `frames/` + `spectrum/`, hardlinked from cache |
| `auth.json`, `CREDENTIALS.txt` | Credentials generated on first start, only with `SPHEREX_LAB_AUTH=required` |

Production: `/opt/docker/spherex/lab`, mounted at `/data`. The lab header displays free disk space. Each target mapped at one FOV occupies approximately 1 GB of FITS, aligned arrays, and WebPs; the VPS is shared with other projects.

## Engine versions

- On first start, `v1` is created from release code.
- A version's code never changes. When a release introduces new backend code (`backend/app/**/*.py` or `engine_server.py`), the **Engine versions** tab shows a notice and allows freezing it as a new version with a title and description, such as “v2 — spectrum with fewer points, faster.” UI labels may retain their original implementation language.
- The **Engine** selector chooses the version for exploration and mapping. Other versions' records and caches remain intact.
- Versions use the current release's venv; if a new version requires a dependency, older engines continue using that same package environment.

### V2 — Optimized spectrum generation

This version evaluates λ only at the four pixels needed for bilinear interpolation and restricts IMAGE/VARIANCE processing to the aperture/background-annulus window. It retains all observations, float32 precision, and photometric results. Local FITS benchmarks are in [`dev/benchmarks/README.md`](../benchmarks/README.md).

After publishing the code, create a new version in **Engine versions**, title it **V2 - Optimized Spectrum Generation**, and select it in **Engine**. In an archive containing only `v1`, it will be recorded as `v2`. Numbering is sequential per archive; the update does not rename versions or modify frozen engines' code, caches, or results. Photometry format version `SPECTRUM_VERSION` stays unchanged because its contract has not changed.

## Records and mapping

- Every search saves a **record** per coordinate. Name and description are optional and editable. Records are shared by everyone using the lab.
- RA accepts degrees (`133.795`) or hours (`08h55m10.8s`, `08 55 10.8`, `08:55:10.8`). Dec accepts degrees (`-7.245`), `−07°14′42″`, `-07 14 42`, or `-07:14:42`.
- **Map…** adds a target to the server queue; the browser tab may be closed. For each selected FOV/band, it downloads all epochs (complete mode), renders 10 variants (five profiles × false color/mono), measures requested-band spectra, and generates charts in both themes. IRSA 502/503 failures retry after 5, 20, and 60 s; previously downloaded data are reused. The target is exported on completion. The queue survives restarts and deployments.
- **Records** displays per-engine overall state (fully mapped, partial, error, queued, mapping), FOVs/bands with FITS/rendered-image percentages, per-band spectra, and the latest mapping failures. With a mapping plan, “100%” refers to requested work; unrelated FOV exploration appears with a dashed badge.
- **Records and caches cannot be deleted through the UI:** every mapped target costs hours of IRSA downloading. The API returns 403 to `DELETE /api/records/<id>` and `DELETE /api/e/<v>/cache/…`. Administrative deletion via `curl` is enabled only with `SPHEREX_LAB_ALLOW_DELETE=1`.

## Product export

`exports/<v>/<slug>/manifest.json`, schema `spherex-lab-target/1`:

- `name`, `description`, `ra_deg`, `dec_deg`, `engine`.
- `sequences[]`: one per FOV/sampling/variant, such as key `30-native/limpa-color`; `frames[].layers[]` matches `/api/sequencias/<id>`, with `image_url` relative to the target folder. Only bands with every epoch rendered in that variant are included; `omitted_bandpasses` lists others.
- `spectrum.dark` / `spectrum.light`: same result format as `/api/espectros/<id>`, with relative `combined_chart_url` and `chart_url`.

Files are hardlinks to the cache, requiring no additional file-data storage. Copy `exports/<v>/` with `cp -a`/`rsync -H` for product use. The lab also serves `/exports/<v>/index.json` and files for inspection.

## Running locally

```bash
SPHEREX_LAB_DATA_DIR="/Users/caio/Documents/Dev/NASA/NSA SphereX/dev/results/temporal-lab-data" \
SPHEREX_LAB_CACHE_DIR="/Users/caio/Documents/Dev/NASA/NSA SphereX/dev/results/temporal-lab-cache" \
  "/Users/caio/Documents/Dev/NASA/NSA SphereX/dev/.venv/bin/python" dev/temporal-lab/server.py --port 8766
```

- Optional `SPHEREX_LAB_CACHE_DIR` attaches a previous cache to `v1` on first run.
- Without `SPHEREX_LAB_AUTH=required`, local use has no password.
- Engines use ports `SPHEREX_LAB_ENGINE_BASE_PORT + n`, default base 8800.

Tests: `python3 -m unittest discover -s dev/temporal-lab/tests -p 'test_*.py'` and `node --test dev/temporal-lab/tests/*.test.mjs`.

## Rendering and spectra

- **Rendering:** `original`, `limpa`, `suave`, `difusa`, `pontual`. Switching presets reuses FITS and aligned arrays, regenerating only the display image.
- **Color:** per-pixel false color (`WCS-WAVE`) or monochrome; multiple bands overlap using `screen` blending.
- **Settings:** final 10′–40′ window, with a downloaded cutout 1.5× larger; native sampling 6.15″/px or interpolated 2× sampling 3.08″/px.
- **Spectrum:** forced photometry (3 px aperture, 6–10 px local background annulus) in every observation. The filter varies across the detector, so each visit measures the target at one λ (`WCS-WAVE`). The 4′ cutouts are downloaded through VARIANCE only; `WCS-WAVE` is cached by detector under `calibration/`. Limits: no proper-motion propagation (WISE 0855 leaves the aperture), no aperture correction, FLAGS unused.

False color encodes visualization: it preserves wavelength order and fractional spacing, but is not a visible-light photograph.
