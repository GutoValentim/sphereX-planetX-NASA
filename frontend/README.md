# Frontend — CosmoSPHERE

React + TypeScript interface, built with Vite. Users explore coordinates or a sky map, compare SPHEREx images across epochs, and inspect spectra. Scientific processing occurs in the backend; the frontend follows API jobs and displays their results.

## Pages

| Route | Page | Purpose |
|---|---|---|
| `/` | `Home` | Introduction, instructions, T.A.R.S. team |
| `/explore` | `ExploreTheSky` | Coordinate form and pre-mapped targets |
| `/explore-map` | `ExploreMap` | WebGL celestial sphere and position selection |
| `/viewer` | `SeeTheSky` | Images, timeline, bands, spectrum |

The query is carried by `/viewer` parameters: `ra`, `dec`, `band`, `date`, `target`, `entry`. Routes are defined in [`src/routes/paths.ts`](src/routes/paths.ts).

## Organization and data flow

- `src/pages/` and `src/components/`: pages and components; `ObservationWorkspace` coordinates viewer sources, tabs, and modes.
- `src/services/api.ts`: Node API queries; images use `modo=balanceada`, all bands, and an anchor band. Jobs are polled to completion.
- `src/services/catalog.ts` and `src/hooks/useCatalog.ts`: laboratory-exported catalog and manifests. Mapped targets use those artifacts, with live-query fallback for missing portions.
- `src/hooks/`: form, timeline, band selection, spectrum, polling. The active query lives in the URL, theme in Context, and history/theme preference in `localStorage`.
- `src/components/sky-map/`: WebGL sphere and markers. `integrations/aladin.ts` and `integrations/plotly.ts` load libraries on demand.
- `src/constants/homeContent.ts`: introduction and team. `src/constants/uiFeatures.ts`: UI flags.
- CSS Modules and `src/styles/`: styles. See the [design system](../docs/DESIGN_SYSTEM.md).

The viewer combines false-color layers using `mix-blend-mode: screen`. DSS2/Aladin supplies a separate optical reference, not SPHEREx data. The spectrum gallery uses backend SVGs; Plotly is an alternative behind a flag.

## Commands

From the repository root, with Node.js 24 and dependencies installed through `npm ci`:

```sh
npm run dev --workspace frontend       # Vite, http://localhost:5173
npm run typecheck --workspace frontend
npm run build --workspace frontend    # frontend/dist/
node --test frontend/tests/*.test.mjs
```

After building, start the production server locally with:

```sh
node frontend/server.mjs              # Express, http://localhost:8080
```

This server implements SPA fallback, static files, and `GET /healthz`. The Vite development server does not implement that healthcheck. The current `frontend/package.json` has no `start` script. To run the complete application, also start Node and Python as described in the [main README](../README.md#running-locally).

## Configuration

| Variable | Use |
|---|---|
| `VITE_API_BASE_URL` | Node API base URL; default `http://localhost:3000` |
| `VITE_CATALOG_URL` | Catalog URL; default `/api/catalogo` on the API. An empty value disables pre-mapped targets |

`VITE_*` variables are read during development/build: set them in the process environment or `frontend/.env.local`. The current `vite.config.ts` does not set the repository root as `envDir`, so root `.env` does not supply those variables to Vite. API CORS must accept the browser's origin (`FRONTEND_ORIGIN`).

## References and limits

- [API contract](../docs/api.md), [architecture](../docs/architecture.md), [complete English technical PDF](../docs/cosmosphere-technical-documentation-en.pdf).
- [Initial specification](../docs/Sky_Explorer_Documentacao_Frontend.md): historical planning reference; current implementation is documented here and in code.
- Existing tests cover the Express server; there is no component/hook test suite.
- The home page includes a spectrum explicitly labeled as illustrative. Scientific viewer results come from IRSA or laboratory exports.
