# Architecture — CosmoSPHERE

CosmoSPHERE combines a web interface, a public gateway, and a Python scientific core to explore real SPHEREx observations. Product overview, team, and local setup are in the [main README](../README.md); contracts are in [api.md](api.md).

## Components

| Path | Responsibility |
|---|---|
| `frontend/` | React + TypeScript + Vite; WebGL map, form, temporal viewer, spectra. `frontend/server.mjs` (Express) serves the build |
| `backend/app/api/` | Node/Express API: `server.ts` starts `createApp()` from `resultados.ts`; query validation, Python forwarding, URL rewriting, catalog delivery through `catalogo.ts` |
| `backend/app/main.py` | FastAPI; validation, IRSA discovery, scientific jobs |
| `backend/app/services/` | IRSA, FITS cutouts, spectral calibration, alignment, rendering, photometry, job managers |
| `dev/temporal-lab/` | Authenticated laboratory, frozen versioned engines, target export |
| `infra/` | Docker Compose, Traefik, SSH deployment, healthchecks, rollback |
| `docs/` | API contract, architecture, design system, technical PDF |

```text
Browser --HTTPS--> Traefik --+--> frontend (Node :8080)
                            +--> api (Node :3000) --HTTP--> python (FastAPI :8000) --HTTPS--> IRSA
                            |                     spherex_internal network
                            +--> lab (Python :8765, authenticated) --> v1, v2... engines --HTTPS--> IRSA
                                             +-- exports/ --read-only--> api /api/catalogo
```

## Data flow

1. The frontend turns coordinates or a map selection into a query carried in the viewer URL.
2. A pre-mapped target uses the laboratory-exported catalog. Missing portions or new coordinates use the public API.
3. The API forwards `/api/consulta` to Python's `/receber-dados`. Image responses contain metadata and `sequencia.status_url`; spectra contain `status_url` and job state.
4. The scientific service queries SIA2 metadata, selects observations with sufficient coverage, downloads FITS cutouts, and processes images or photometry in the background.
5. The frontend follows jobs and displays layers/charts as they become ready. The API rewrites internal paths under `/api/sequencias/…` and `/api/espectros/…`.

Spatial alignment, wavelength calibration, and flux calculation take place in Python. False color and WebP frames are display derivatives; FITS remains the scientific source.

## Persistence and execution

There is no database or external queue. `SequenceJobManager` and `SpectrumJobManager` execute threaded jobs in one process and keep their states in memory. Restarting loses job state but retains cached files. Metadata, FITS, aligned arrays, frames, photometry, and charts are reused through parameter-derived identifiers.

The regenerable production cache lives at `/opt/docker/spherex/cache`. The laboratory archive at `/opt/docker/spherex/lab` includes frozen engines, data, and exports. Preserve it: reconstruction requires hours of downloads.

## Production boundaries

Frontend, API, Python, and laboratory run in separate containers. Traefik publishes **frontend, API, and laboratory** over HTTPS; the laboratory requires HTTP Basic. Python has no public route and is reached by the API at `http://spherex-python:8000`. The exports volume is read-only in the API (`SPHEREX_CATALOG_DIR=/catalog`).

The public API requires no token and applies no rate limiting. CORS accepts `FRONTEND_ORIGIN`. The IRSA client restricts HTTPS downloads to `irsa.ipac.caltech.edu`.

## CI/CD

The [workflow](../.github/workflows/ci-cd.yml) detects changed paths and validates affected projects. Approved pushes to `main` publish the corresponding services, check `/healthz`, and restore the previous release on failure. Each service reports its own SHA; unchanged services may remain on previous SHAs.

Changes only to root README and `docs/` do not select a service for deployment. Files under `frontend/` or `backend/`, including documentation, follow those directories' filters. See [infra/README.md](../infra/README.md) for operations.
