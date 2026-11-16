# AGENTS.md

Guide for AI coding agents (Claude Code, Codex, Cursor, and others) working in this repository. The same guidance applies to human contributors. This file summarizes the essentials; detailed instructions are in the linked READMEs.

## Project

**CosmoSPHERE — SPHEREx Explorer**, developed for NASA Space Apps Challenge (Planet X / SPHEREx). It shows how a sky position changes across SPHEREx observation epochs using aligned false-color images, and measures the target's spectrum in bands D1–D6.

Project documentation and copy are maintained in **English**, as are code symbols and commit messages (Conventional Commits: `feat:`, `fix(frontend):`, etc.). Preserve existing API routes, field names, accepted parameter values, and filenames when they are part of an implementation contract.

## Production architecture

```text
Browser --HTTPS--> Traefik --+--> frontend (Node :8080)              web network
                            +--> api (Node :3000) --HTTP--> python (FastAPI :8000) --HTTPS--> IRSA
                            |                     spherex_internal network
                            +--> lab (Python :8765, password) --> frozen v1, v2... engines (subprocesses) --> IRSA
```

- React/Vite frontend: <https://spherex.prospectordigital.com.br>.
- Public Node/Express API: <https://api.spherex.prospectordigital.com.br>.
- FastAPI (`backend/app/main.py`): internal network only, `http://spherex-python:8000`; writable cache at `/opt/docker/spherex/cache`.
- Laboratory (`dev/temporal-lab`): <https://lab.spherex.prospectordigital.com.br>, HTTP Basic. Credentials: `/opt/docker/spherex/lab/CREDENTIALS.txt`; archive: `/opt/docker/spherex/lab` — **do not delete**, as it contains the product's pre-mapped data.
- Oracle ARM64 VPS, Docker, Portainer, Traefik. GitHub Actions automatically deploys pushes to `main`. **Merging into `main` publishes to production.**

See `docs/architecture.md` and `infra/README.md`.

## Repository map

| Path | Contents |
|---|---|
| `frontend/` | React 19 + Vite + TypeScript npm workspace. `src/services/api.ts` calls the API; `server.mjs` serves the build and `/healthz` |
| `backend/app/api/*.ts` | Node/Express API: `server.ts` starts `resultados.ts` (queries, image/spectrum jobs, files); `catalogo.ts` serves exports. `consulta.ts` is legacy scaffolding |
| `backend/app/main.py` | FastAPI: `/receber-dados`, `/espectros/…`, `/sequencias/…`, `/healthz` |
| `backend/app/services/` | Scientific core: `irsa_client`, `image_aligner`, `frame_generator` (rendering profiles), `spectral_color`, `temporal_sequence_service`, `sequence_jobs`, `spectrum_service`, `spectrum_jobs`, `spectrum_chart`, `cutout_cache` |
| `backend/tests/` | Node `api.test.ts`, Python `test_*.py` |
| `infra/` | `compose.yaml`, `deploy.sh`, `ssh-deploy.sh`, deployment tests |
| `dev/temporal-lab/` | Published mapping lab: `server.py` (gateway, records, queue, export), `engine_server.py` (scientific API, frozen copy per engine version), `lab_store.py`. See its README |
| `prototypes/` | Standalone prototypes such as `sky-sphere` |
| `docs/` | API contracts, architecture, design system, frontend specification, technical PDF |

CI and deployment classify `backend/*.py` and `backend/requirements*.txt` as Python **and** lab; `dev/temporal-lab/` as lab; other `backend/` files as Node API; `frontend/` as frontend; `infra/` as the full stack; `package.json`, `package-lock.json`, and `eslint.config.mjs` as API and frontend. Other paths, including this file, do not trigger deployment.

## Main contract

See `docs/api.md` for details.

- `GET /api/consulta?RA&DEC&Data[&elemento=imagem|espectro][&bandas=D1,D3][&tema=escuro|claro]`, also POST with JSON.
  - `imagem` (default): observation metadata + `sequencia` (job at `/api/sequencias/<id>`; aligned per-epoch/per-band false-color WebPs appear as ready).
  - `espectro`: job at `/api/espectros/<id>`; measured points and SVG charts.
- Errors always use `{ "erro": "…" }`. Without `PYTHON_API_URL`, return 503; Python unreachable, 502; timeout, 504.

Scientific details that are not obvious from code:

- Spectra use multi-epoch forced photometry: the SPHEREx filter varies across the detector (`WCS-WAVE`), so each observation measures the target at one wavelength per band.
- Cutouts are partially downloaded through IMAGE or VARIANCE; the approximately 4 MB EPSF table is skipped. `WCS-WAVE` tables are cached by detector and `[CALIB] spectral_wcs` UUID under `<cache>/calibration`.
- All epochs use the same TAN grid (6.15″/px) and display interval. Independent normalization creates artificial brightness variation.
- False color is a representation only; FITS remains the scientific source.

## Running locally

Node 24 and Python 3.11+.

```sh
npm ci
cp .env.example .env                      # PYTHON_API_URL=http://localhost:8000
npm run dev                               # Express API :3000
npm run dev --workspace frontend          # Vite :5173
cd backend && pip install -r requirements-dev.txt && uvicorn app.main:app --port 8000 --reload
```

The lab's port 8765 is often occupied. Use another port and reuse existing caches:

```sh
SPHEREX_LAB_DATA_DIR="<lab data>" SPHEREX_LAB_CACHE_DIR="<optional previous cache>" \
  <venv>/bin/python dev/temporal-lab/server.py --port 8766
```

## Pre-PR validation

The same checks as CI:

```sh
npx eslint backend frontend dev
npx tsc --noEmit -p backend/tsconfig.json
npx tsx --test backend/tests/*.test.ts
node --test frontend/tests/*.test.mjs
npm run typecheck --workspace frontend
npm run build --workspace frontend
python3 -m unittest discover -s infra/tests
node --test dev/temporal-lab/tests/*.test.mjs
<venv>/bin/python -m unittest discover -s dev/temporal-lab/tests -p 'test_*.py'
cd backend && <venv>/bin/python -m unittest discover -s tests -p 'test_*.py'
```

## Rules and pitfalls

- **Commit, PR, and merge only when requested by the maintainer.** Merging into `main` publishes to production. Check `/healthz` afterward. Each service reports its own SHA, so an unchanged service remaining on an older SHA is expected.
- `infra/deploy.sh` and `infra/ssh-deploy.sh` are installed as root on the VPS; CI **does not update them**. If they change, install them through administrative SSH before merging; commands are in `infra/README.md`.
- Never resolve `package-lock.json` conflicts manually; run `npm install` at the repository root.
- Changes to `backend/app/**/*.py` reach the lab as new code but do not modify frozen engine versions. Testers create a new version in the engine-version tab. Changing cache formats or `engine_server.py` APIs must preserve compatibility with old engines in the laboratory interface.
- `infra/tests` must run with macOS bash 3.2: no `declare -A` or `${x^^}`.
- Local Docker may fail while the macOS keychain is locked; test containers using disposable VPS containers.
- IRSA sometimes returns 503. Jobs retry, but a layer may finish `failed`. Reproduce the behavior before treating it as a code defect.
- Known limits: no proper-motion propagation (fast targets such as WISE 0855 leave the aperture), FLAGS unused pending official bit definitions, no spectral aperture correction.
- Downloads only from `https://irsa.ipac.caltech.edu`. Prefer cutouts and small file counts for experiments.
- Never commit `.env`, `api.env`, or keys such as `~/.ssh/spherex_github_actions_ed25519`.
- Update `docs/api.md` in the same PR whenever the API contract changes.
