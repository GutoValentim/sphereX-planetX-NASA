# API — CosmoSPHERE

The public Node/Express API forwards queries to the FastAPI scientific service, follows jobs, and serves artifacts. References: [README](../README.md), [scientific backend](../backend/README.md), [frontend](../frontend/README.md), [complete English technical PDF](cosmosphere-technical-documentation-en.pdf).

## Addresses and conventions

| Item | Value |
|---|---|
| Production base URL | `https://api.spherex.prospectordigital.com.br` |
| Local base URL | `http://localhost:3000` |
| Format | UTF-8 JSON; `image/webp` images, `image/svg+xml` charts |
| Public authentication | No token; laboratory has separate HTTP Basic |
| CORS | Single `FRONTEND_ORIGIN`; methods `GET`, `POST`, `OPTIONS` |
| JSON body | 1 MB limit |
| Node → Python timeout | 30 s per call; long processing continues in pollable jobs |

Python is not published on the internet. The API rewrites `/sequencias/…` and `/espectros/…` URLs with the public `/api` prefix. `status_url` is relative to the API base; file URLs can be used by the interface after resolving that base. Field names and accepted values retain their implementation names, including Portuguese identifiers.

### Health

`GET /healthz`:

```json
{ "status": "ok", "service": "spherex-api", "version": "<release SHA>" }
```

The frontend Express server and Python expose the same endpoint, with `service` values `spherex-frontend` and `spherex-python`. Health indicates process availability, not scientific coverage or IRSA availability. Vite development does not implement this endpoint.

## Query

- `GET /api/consulta`: query-string parameters.
- `POST /api/consulta`: JSON body; `bandas` as a list. The body is forwarded to Python.

| Parameter | Required | Values and effect |
|---|---|---|
| `RA` | Yes | ICRS degrees; `0 ≤ RA < 360` |
| `DEC` | Yes | ICRS degrees; `−90 ≤ DEC ≤ 90` |
| `Data` | For GET | Valid date for GET; `YYYY-MM-DD` recommended. Optional for POST. Echoed in `consulta`, but **does not filter** discovery |
| `elemento` | No | `imagem` (default) or `espectro` |
| `bandas` | No | Image **or** spectrum bands: query `D1,D3`; JSON `["D1", "D3"]`. Accepts `SPHEREx-` prefix; defaults to D1–D6 |
| `tema` | No | Spectrum: `escuro` (default) or `claro` |
| `modo` | No | Images: `rapida` (default, up to 4 epochs), `balanceada` (up to 12), `completa` (all, safety limit 100) |
| `perfil` | No | Images: `limpa` (default), `original`, `suave`, `difusa`, `pontual` |
| `cor` | No | Images: `falsa` (default) or `mono` |
| `referencia` | No | Images: epoch anchor band; default `D3` |

The current frontend requests images in `balanceada` mode with all six bands. A selected band defines the anchor; `P` uses D3. Invalid bands and unsupported options return 400.

### Images: metadata and job

```text
GET /api/consulta?RA=133.79513&DEC=-7.24515&Data=2026-11-15&elemento=imagem&bandas=D1,D3&modo=balanceada
```

Abbreviated illustrative 200 response:

```json
{
  "consulta": { "RA": 133.79513, "DEC": -7.24515, "Data": "2026-11-15" },
  "request_id": "3f2a9c1b0d4e5f60",
  "bandpass": "SPHEREx-D3",
  "collections": ["spherex_dr1", "spherex_qr3"],
  "fov_arcmin": 30.0,
  "cutout_fov_arcmin": 45.0,
  "pixel_scale_arcsec": 6.15,
  "observations": [
    { "observation_id": "…", "observed_at": "2025-…", "access_url": "https://irsa.ipac.caltech.edu/…" }
  ],
  "cache_hit": false,
  "sequencia": {
    "status_url": "/api/sequencias/9b1c2d3e4f5a6b7c",
    "job": { "job_id": "9b1c2d3e4f5a6b7c", "status": "discovering" }
  }
}
```

Synchronous discovery returns D3 metadata for observations whose footprints contain the 45′ source cutout. The multiband sequence downloads and renders FITS in the background. Metadata caching avoids repeat SIA2 queries for the same dataset; the initial response does not wait for every frame.

### Spectrum: start or retrieve a job

```text
GET /api/consulta?RA=133.68146&DEC=-7.29895&Data=2026-11-15&elemento=espectro&bandas=D1,D3
```

Returns 202 while the job is `running`, or 200 if the same query has already completed:

```json
{
  "elemento": "espectro",
  "status_url": "/api/espectros/75b74ca95298b93b",
  "job": {
    "job_id": "75b74ca95298b93b",
    "status": "running",
    "progress": { "SPHEREx-D1": { "done": 3, "total": 35 } }
  }
}
```

## Image sequences

### `GET /api/sequencias/<job_id>`

`job_id` has 16 hexadecimal characters. States: `discovering` → `rendering` → `completed`, `partial`, or `failed`. `partial` means at least one layer still failed after retries.

Abbreviated illustrative response:

```json
{
  "job_id": "9b1c2d3e4f5a6b7c",
  "status": "rendering",
  "anchor_bandpass": "SPHEREx-D3",
  "frames": [
    {
      "id": "2025W46_2A_0214_1",
      "observed_at": "2025-11-14T12:07:21.418",
      "layers": [
        {
          "bandpass": "SPHEREx-D3",
          "delta_seconds": 0.0,
          "image_url": "/api/sequencias/arquivos/3f2a9c1b0d4e5f60/frames/limpa-color/001_2025W46_2A_0214_1.webp?v=8",
          "error": null
        }
      ]
    }
  ],
  "progress": { "done": 7, "total": 24 },
  "error": null
}
```

Poll approximately every 1.5 s while the job is running. Each `image_url` stays `null` until its layer is ready; errors are reported by layer and band. `delta_seconds` gives the time offset from the anchor epoch: bands may have been observed at different instants.

### `GET /api/sequencias/arquivos/<dataset>/frames/<variante>/<arquivo>.webp`

Aligned, north-up frames, default 293×293 pixels: RGBA false color or L monochrome. A variant is `<perfil>-color` or `<perfil>-mono`. `Cache-Control: public, max-age=86400`; `?v=<FRAME_CACHE_VERSION>` invalidates old versions. Invalid path patterns return 404.

## Spectra

### `GET /api/espectros/<job_id>`

States: `running` → `completed` or `failed`. Poll approximately every 1.5 s until a terminal state.

Abbreviated illustrative completed response:

```json
{
  "job_id": "75b74ca95298b93b",
  "status": "completed",
  "result": {
    "combined_chart_url": "/api/espectros/arquivos/0a1b2c3d4e5f6a7b/spectrum/combined-dark-example.svg",
    "bands": [
      {
        "bandpass": "SPHEREx-D1",
        "chart_url": "/api/espectros/arquivos/0a1b2c3d4e5f6a7b/spectrum/band-dark-example.svg",
        "band": { "wavelength_min_um": 0.744, "wavelength_max_um": 1.116, "display_rgb": [0, 17, 255] },
        "measured_count": 35,
        "observation_count": 35,
        "outliers": [],
        "rejected": {},
        "failed": {},
        "points": [ { "wavelength_um": 0.75, "flux_mjy": 361.2, "flux_error_mjy": 4.1, "observed_at": "…" } ],
        "channels": [ { "wavelength_um": 0.76, "flux_mjy": 358.0 } ]
      }
    ]
  },
  "error": null
}
```

- `points`: per-observation measurements, including wavelength, flux, uncertainty.
- `channels`: medians in up to 17 logarithmically spaced wavelength channels per band.
- `outliers`: flagged points, drawn with open markers and excluded from medians.
- `rejected`: observations discarded for scientific reasons.
- `failed`: network failures in this run, eligible for retry later.

Spectra use forced photometry with a 3 px aperture and local background, target-pixel λ from `WCS-WAVE`, and uncertainties from `VARIANCE`. The 4′ cutouts are downloaded only through `VARIANCE`; `WCS-WAVE` calibration is reused by detector/version. New coordinates may take minutes; cache and IRSA availability affect duration. Scientific limits are described in the [backend reference](../backend/README.md#spectrum-spectrum_service-spectrum_chart).

### `GET /api/espectros/arquivos/<id>/spectrum/<arquivo>.svg`

Per-band and combined charts, in light/dark themes, ready for `<img src>`. Names contain a content hash: `Cache-Control: public, max-age=31536000, immutable`.

## Pre-mapped target catalog

Read-only, served from laboratory exports mounted at `SPHEREX_CATALOG_DIR` (production: `/opt/docker/spherex/lab/exports` → `/catalog:ro`). Returns 503 without that variable.

- `GET /api/catalogo/index.json`: target list using schema `spherex-catalog/1`, names, coordinates, slug, manifest, sequences, themes, export date, engine. Sorted by name; `max-age=30`.
- `GET /api/catalogo/<slug>/manifest.json`: `spherex-lab-target/1` manifest. `sequences[].frames[].layers[]` follows the sequence format; `spectrum.dark|light` follows the spectrum format. URLs relative to target folder; `max-age=60`.
- `GET /api/catalogo/<slug>/<caminho>`: `.webp`, `.svg`, `.json` files from the manifest's engine; invalid patterns return 404. Images use `max-age=86400`.

For each target, the newest engine with a fully complete export is used: six bands in all sequences and spectra in both themes. If none is complete, the oldest engine's export is used. A new engine therefore does not replace a complete target with partial results.

The frontend defaults to `/api/catalogo`; `VITE_CATALOG_URL` overrides it, or disables it when empty. See [dev/temporal-lab/README.md](../dev/temporal-lab/README.md).

## Errors

Always JSON `{ "erro": "…" }`; FastAPI validation includes `detalhes`.

| Status | Condition |
|---|---|
| 400 | Invalid input or malformed job ID |
| 404 | No coverage, nonexistent job, missing/invalid file |
| 422 | Observation count exceeds sequence safety limit |
| 502 | IRSA unavailable, Python unreachable, or invalid Python response |
| 503 | `PYTHON_API_URL` or catalog not configured |
| 504 | 30 s timeout communicating with Python |

Jobs can also end in a failure state, with details in their status response. The laboratory uses separate authentication; 401/403 are not public-API authentication responses.

## Internal Python service

Local: `http://localhost:8000`. Production: `http://spherex-python:8000`, Docker network only.

- `POST /receber-dados`: validates queries and returns metadata + image job, or a spectrum job.
- `GET /sequencias/<job_id>` and `GET /sequencias/arquivos/…`: state and WebP files.
- `GET /espectros/<job_id>` and `GET /espectros/arquivos/…`: state and SVGs.
- `GET /healthz`: process and scientific-service SHA.

Local execution and variables are documented in the [main README](../README.md#running-locally). `Data` is reference metadata, not a temporal discovery filter.
