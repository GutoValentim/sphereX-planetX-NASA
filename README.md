# CosmoSPHERE

**SPHEREx Explorer**

**T.A.R.S. — Team for Advanced Research of Space**

Uberlândia, Minas Gerais, Brazil

A web application for exploring real SPHEREx observations by celestial coordinates, comparing images across epochs, and viewing a target's spectrum in bands D1–D6. Developed for the **NASA Space Apps Challenge**, **Planet X and SPHEREx** challenge. This is an independent team project, not an official NASA product.

**[Use CosmoSPHERE](https://spherex.prospectordigital.com.br)** · **[Watch the presentation video](https://drive.google.com/file/d/1xt4HQJ09D3Wwk2i0KqjHzUGhwhsYN4wH/view?usp=drive_link)** · **[Complete technical documentation in English (PDF)](docs/cosmosphere-technical-documentation-en.pdf)** · **[Public repository](https://github.com/GutoValentim/sphereX-planetX-NASA)**

## What the project does

- **Coordinate or sky-map exploration:** enter right ascension and declination, or select a position on the interactive celestial sphere.
- **Temporal comparison:** images reprojected onto the same celestial grid, north up and target centered, with a playable timeline.
- **Multiband visualization:** false-color D1–D6 overlays and a monochrome option.
- **Target spectrum:** forced photometry across observations, with points, uncertainties, per-band charts, and a combined chart.
- **Pre-mapped targets:** the laboratory prepares images and spectra, versions the scientific engine, and exports a catalog to the application.
- **Optical reference:** DSS2 color, displayed through Aladin Lite, helps locate the field. This reference image is not SPHEREx data.

The main flow is **choose a position → open the viewer → compare epochs/bands or inspect the spectrum**. New queries depend on IRSA coverage and availability and may take minutes; previously processed results are reused from cache.

## Scientific background

[NASA's SPHEREx mission](https://science.nasa.gov/mission/spherex/) performs a near-infrared spectral sky survey spanning approximately **0.75–5.0 µm**. The project queries public [NASA/IPAC IRSA](https://irsa.ipac.caltech.edu/Missions/spherex.html) data in the `spherex_dr1` and `spherex_qr3` collections.

The **linear variable filter (LVF)** makes the measured wavelength vary across each detector. An exposure therefore measures a target at one wavelength per band; a spectrum is assembled by combining measurements from different visits. The backend uses scientific FITS files, `WCS-WAVE` calibration, and the `VARIANCE` extension to estimate photometric uncertainties.

For image comparison, every epoch is reprojected using WCS/SIP onto a common TAN grid at **6.15″ per pixel**, keeping the same display range within each variant. False color maps infrared wavelengths to visible colors logarithmically: **it represents wavelength, not the object's true visible color**. FITS remains the scientific source.

**Important limits:** inter-epoch differences can also reflect the LVF wavelength sampled and the PSF; a common scale does not remove these effects. Photometry does not yet propagate proper motion, apply aperture correction, or use the `FLAGS` mask. Bands are paired to the nearest observation in time, with `delta_seconds` reported, so a composite may combine different instants. The API accepts `Data`, but it **does not yet filter observation discovery**. The project does not claim to detect or confirm Planet X.

## Data sources and credits

| Official source or reference service | Use in CosmoSPHERE |
|---|---|
| [NASA — SPHEREx mission](https://science.nasa.gov/mission/spherex/) | Mission context, scientific goals, instrument |
| [NASA/IPAC IRSA — SPHEREx](https://irsa.ipac.caltech.edu/Missions/spherex.html) | Public observations and FITS products from `spherex_dr1` and `spherex_qr3` |
| [IRSA — program interfaces](https://irsa.ipac.caltech.edu/voapi.html) | SIA2 discovery through `astroquery` and IBE access to FITS files/cutouts |
| [IRSA — Quick Release Explanatory Supplement](https://irsa.ipac.caltech.edu/data/SPHEREx/docs/SPHEREx_Expsupp_QR.pdf) | Scientific products, FITS extensions, calibration, `WCS-WAVE` |
| [NASA/JPL-Caltech — first all-sky map, PIA26600](https://www.jpl.nasa.gov/images/pia26600-spherexs-first-all-sky-map/) | Star/galaxy and gas/dust maps used as celestial-sphere textures, distinct from individual viewer cutouts |
| [NASA Scientific Visualization Studio — SPHEREx Spacecraft and Observing Animations](https://svs.gsfc.nasa.gov/14966/) | Spacecraft video and presentation image used on the home page |
| [CDS/DSS2 color, IRSA HiPS mirror](https://irsa.ipac.caltech.edu/data/hips/CDS/DSS2/color) | Aladin Lite optical reference sky; **not a SPHEREx observation** |

**Data acknowledgement:** this project uses SPHEREx mission data products, a joint project of the Jet Propulsion Laboratory and the California Institute of Technology, funded by NASA and made available through NASA/IPAC IRSA. The maps and visual resources above are credited to NASA/JPL-Caltech and the additional contributors listed on the source pages. Use of these public resources does not imply institutional affiliation or NASA endorsement of CosmoSPHERE.

## Architecture and services

```text
Browser → Traefik (HTTPS) → React frontend
                         → Node/Express API → FastAPI/Python → NASA/IPAC IRSA
                         → authenticated laboratory → versioned engines
                                      └─ exports → API catalog
```

| Component | Technology and responsibility | Access |
|---|---|---|
| Frontend | React + TypeScript + Vite; WebGL map, viewer, timeline, spectra | [Production application](https://spherex.prospectordigital.com.br) |
| Public API | Node.js 24 + Express; validation, Python gateway, files, catalog | [API healthcheck](https://api.spherex.prospectordigital.com.br/healthz) |
| Scientific service | FastAPI/Python; IRSA discovery, FITS cutouts, alignment, rendering, photometry | Internal network only in production |
| Laboratory | Python; pre-mapping, frozen engine versions, exports | [Laboratory](https://lab.spherex.prospectordigital.com.br), authenticated |

There is no database or external queue: artifacts are stored as files and jobs run in threads. The production cache is regenerable; the laboratory archive must be preserved. See [docs/architecture.md](docs/architecture.md).

## Documentation

| Reference | Contents |
|---|---|
| [Complete technical documentation — English PDF](docs/cosmosphere-technical-documentation-en.pdf) | November 15, 2026 edition: architecture, frontend, API, science, formulas, figures, operations |
| [Frontend](frontend/README.md) | Current routes, components, state, configuration, commands |
| [Scientific backend](backend/README.md) | Image processing, false color, spectra, limitations |
| [API contract](docs/api.md) | Queries, parameters, image/spectrum jobs, files, catalog |
| [Architecture](docs/architecture.md) | Services, data flow, persistence, production boundaries |
| [Operations and deployment](infra/README.md) | VPS, Docker, Traefik, DNS, CI/CD, rollback |
| [Laboratory](dev/temporal-lab/README.md) | Pre-mapping, engines, target export |
| [Design system](docs/DESIGN_SYSTEM.md) | Interface styles and components |
| [Initial frontend specification](docs/Sky_Explorer_Documentacao_Frontend.md) | Historical implementation-planning reference; does not replace current code or the references above |

Repository documentation is maintained in English. Existing API field names, parameter values, filenames, and code identifiers retain their implementation names. The PDF is a dated edition; consult the Markdown files and `main` code for current commands and contracts.

## Running locally

Requirements: **Node.js 24**, npm, and **Python 3.11+**. Production uses Python 3.12.

From the repository root:

```sh
npm ci
cp .env.example .env
python3 -m venv .venv
.venv/bin/python -m pip install -r backend/requirements-dev.txt
```

Start these three processes in separate terminals, all from the repository root:

```sh
# Terminal 1 — scientific service
.venv/bin/python -m uvicorn app.main:app --app-dir backend --port 8000 --reload
```

```sh
# Terminal 2 — public API; .env contains PYTHON_API_URL=http://localhost:8000
npm run dev
```

```sh
# Terminal 3 — frontend
npm run dev --workspace frontend
```

Open [http://localhost:5173](http://localhost:5173). The API runs at `http://localhost:3000` and the scientific service at `http://localhost:8000`. All three production servers expose `GET /healthz`; the Vite development server does not implement that endpoint.

To test production builds locally, keep Python running and execute:

```sh
npm run build
# In one terminal:
FRONTEND_ORIGIN=http://localhost:8080 npm start
# In another terminal:
node frontend/server.mjs
```

The compiled interface opens at `http://localhost:8080`. Start its Express server directly with `node frontend/server.mjs`; the current workspace has no `start` script.

### Configuration

- Root `.env`: `PORT`, `FRONTEND_ORIGIN`, `PYTHON_API_URL` for Node.
- Frontend: `VITE_API_BASE_URL` in the build environment or `frontend/.env.local`; default `http://localhost:3000`.
- Catalog: `SPHEREX_CATALOG_DIR` points to laboratory exports; without it, `/api/catalogo` returns 503. Empty `VITE_CATALOG_URL` disables the interface catalog.
- Scientific cache: `SPHEREX_CACHE_DIR`; default `backend/cache/temporal/`.

Never commit credentials, `.env` files, or keys. Other variables are documented in the [API](docs/api.md), [frontend](frontend/README.md), and [operations](infra/README.md) references.

## API overview

The public API requires no token. It accesses Python over the internal network; the laboratory uses separate authentication.

| Route | Purpose |
|---|---|
| `GET /healthz` | Process availability and release SHA |
| `GET /api/consulta?RA=...&DEC=...&Data=YYYY-MM-DD` | Coordinate query; `elemento=imagem` or `espectro` |
| `POST /api/consulta` | Same parameters as JSON |
| `GET /api/sequencias/<job_id>` | Progress, epochs, ready image layers |
| `GET /api/espectros/<job_id>` | Spectrum progress, points, charts |
| `GET /api/catalogo/index.json` | Pre-mapped target list |

Image-sequence example:

```sh
curl --get 'http://localhost:3000/api/consulta' \
  --data-urlencode 'RA=133.79513' \
  --data-urlencode 'DEC=-7.24515' \
  --data-urlencode 'Data=2026-11-15' \
  --data-urlencode 'elemento=imagem' \
  --data-urlencode 'bandas=D1,D3' \
  --data-urlencode 'modo=balanceada'
```

The response contains metadata and `sequencia.status_url`; poll that path until a terminal state. For spectra, use `elemento=espectro` and poll `status_url`. These calls do not instantly download all results. Formats, options, and errors are documented in [docs/api.md](docs/api.md).

## Validation and publication

```sh
npm run lint
npm run typecheck
npm test
npm run build
(cd backend && ../.venv/bin/python -m unittest discover -s tests -p 'test_*.py')
node --test dev/temporal-lab/tests/*.test.mjs
.venv/bin/python -m unittest discover -s dev/temporal-lab/tests -p 'test_*.py'
```

Aggregate `npm test` does not include every scientific and laboratory test. [GitHub Actions](.github/workflows/ci-cd.yml) detects changed projects and runs their checks. Changes only to root `README.md` and `docs/` do not redeploy services; changes under application/infrastructure paths follow `main`'s automatic deployment. Deployment verifies healthchecks and restores the previous release on failure.

## Team

**T.A.R.S. — Team for Advanced Research of Space** · Uberlândia, Minas Gerais, Brazil.

| Member | Professional background / education | LinkedIn |
|---|---|---|
| **Caio Séjour** | Telecommunications engineer | [Profile](https://www.linkedin.com/in/caio-s%C3%A9jour-araujo-a5b9b6147/) |
| **Gustavo Valentim** | Undergraduate student in Computer Science | No profile |
| **Michael Reis** | Data analyst | [Profile](https://www.linkedin.com/in/michael-dos-reis-bb7763196/) |
| **Raul de Souza** | High school student | No profile |
