# CosmoSPHERE on the Oracle VPS

This stack has four services: `frontend` and `api` (Node, published by Traefik), `python` (FastAPI, not published), and `lab` (mapping laboratory in `dev/temporal-lab`, published at `lab.spherex…` with authentication). It uses the external `web` network and existing Traefik instance. `api` and `python` also share the private `spherex_internal` network, through which the API calls `http://spherex-python:8000`. It exposes no additional host ports and does not recreate other projects. Compose belongs exclusively to this project; do not run `docker compose down` in another application's directory.

## Pipeline

`.github/workflows/ci-cd.yml` validates PRs targeting `main` and pushes to `main` through independent project jobs:

- **Backend:** installs Node dependencies, runs ESLint, TypeScript, API tests, build.
- **Python:** installs `backend/requirements-dev.txt` and tests the scientific core/FastAPI.
- **Frontend:** installs Node dependencies, runs ESLint, TypeScript, server tests, Vite build.
- **Lab:** ESLint for `dev/`, Python/Node lab tests, smoke test starting an authenticated gateway and `v1` engine.
- **Infra:** Bash syntax checks and Python deployment tests.

`backend/**/*.py` and `backend/requirements*.txt` belong to Python and lab (which freezes that code into engine versions); `dev/temporal-lab/**` belongs only to lab; other `backend/` files belong to the Node API. If one service changes without `infra/` changes, it deploys when its own CI passes, independently of other services. `infra/` changes trigger a full-stack deployment requiring all checks. Manual dispatch also validates and publishes the full stack. PRs only validate; merging produces the push that publishes.

After CI passes, deployment uses a dedicated `spherex-deploy` SSH key. It accepts only `deploy <40-character SHA> [api|frontend|python|lab|stack]`, with no shell, SFTP, tunnels, or port forwarding. Repository secret `SPHEREX_SSH_PRIVATE_KEY` is configured. The local key is `~/.ssh/spherex_github_actions_ed25519`; never commit it. `ssh_known_hosts` contains only server public keys previously trusted by this Mac.

The VPS fetches the public repository over HTTPS and publishes exactly the approved commit. A VPS lock serializes deployments. Runs superseded by `main` are skipped to avoid regressions caused by CI completion order.

Node builds run in temporary `node:24-bookworm-slim` containers limited to 1 GB/1 CPU. API deployment compiles only the backend; frontend deployment compiles only the frontend. Both install from the lockfile and remove development dependencies. Python builds use `python:3.12-slim-bookworm` (2 GB/1 CPU), creating a release venv at `/app/.venv` from `backend/requirements.txt`. Lab reuses the same commit's Python release when available (same venv and `/app` path), otherwise performs the same build. Full-stack deployment prepares all three release types. Runtime containers use these official images; no custom image, registry, or development server is used in production. Containers are non-root with read-only filesystems/code, CPU/memory limits, and rotated logs. Python has 2 GB/1 CPU and writes only to `/opt/docker/spherex/cache` (mounted at `/cache`) and memory-backed `/tmp`.

Releases live under `/opt/docker/spherex/releases/<api|frontend|python|lab>/<SHA>`. Links `/opt/docker/spherex/current-api`, `current-frontend`, `current-python`, and `current-lab` switch atomically. A service deployment recreates only its container; a stack deployment recreates all. Each service reports its own version through `/healthz`. Recreation causes a brief interruption; this is not a zero-downtime flow.

The SHA comes from generated `.release.env`, included in each release. If startup or healthchecking fails, deployment restores that service's previous release; full-stack rollback also restores the previous Compose file. A service without a previous release, such as its first deployment, is removed during rollback. Build failure leaves existing services running. Each service retains the active and previous releases plus the three most recent additional releases.

## VPS files

- `/opt/docker/spherex/compose.yaml`: active Compose, initially copied by SCP and updated from releases.
- `/opt/docker/spherex/.env`: independent API/frontend paths and domains; see `.env.example`.
- `/opt/docker/spherex/api.env`: private API variables; see `api.env.example`. `PYTHON_API_URL` comes from Compose, not this file. Owner UID/GID 1000, mode 600, mounted read-only only in API. Node loads it directly without Portainer reading the host path.
- `/opt/docker/spherex/repository.git`: bare clone of the public repository.
- `/opt/docker/spherex/api-current-sha`, `frontend-current-sha`, `python-current-sha`: latest published releases per service.
- `/opt/docker/spherex/cache`: Python writable cache, UID 1000; fully regenerable and safe to clear.
- `/opt/docker/spherex/lab`: laboratory archive, UID 1000; frozen engines, records, version caches, product exports. **Not regenerable without hours of IRSA downloads; do not delete.** `CREDENTIALS.txt` stores the credentials generated on first start. To rotate them, delete `auth.json` and `CREDENTIALS.txt` and restart the container.
- `/opt/docker/spherex/lab/exports`: mounted at `/catalog:ro` in API (`SPHEREX_CATALOG_DIR`) for `/api/catalogo`. Must exist with UID 1000 before stack deployment; if Docker creates it as root, lab cannot export.
- `/opt/docker/spherex/current-sha`: last completed deployment SHA.
- `/usr/local/sbin/spherex-deploy`: root-owned `deploy.sh` copy.
- `/usr/local/bin/spherex-ssh-deploy`: root-owned restricted SSH command.
- `/etc/sudoers.d/spherex-deploy`: permits the CI user to run only the deployment script.

Actual `.env` files have mode 600 and are never committed. GitHub receives only the dedicated deployment-key secret; other applications' credentials are not copied into this stack. Changes to installed `/usr/local` scripts require administrative SSH installation; the pipeline does not overwrite its own privileged commands.

Before the first independent-service deployment, update the root-owned server scripts once from `infra/deploy.sh` and `infra/ssh-deploy.sh`. The restricted Actions key cannot install them. Perform that administrative migration before publishing `infra/` changes requiring the new deployment arguments.

From the repository root, copy and install the scripts through administrative SSH:

```sh
scp infra/deploy.sh infra/ssh-deploy.sh ubuntu@150.230.73.212:/tmp/
ssh ubuntu@150.230.73.212 'sudo install -o root -g root -m 755 /tmp/deploy.sh /usr/local/sbin/spherex-deploy && sudo install -o root -g root -m 755 /tmp/ssh-deploy.sh /usr/local/bin/spherex-ssh-deploy && rm -f /tmp/deploy.sh /tmp/ssh-deploy.sh'
```

## Portainer

Stack `spherex`, environment `local`. Compose uses fixed binds to `/opt/docker/spherex/current-api` and `/opt/docker/spherex/current-frontend`, allowing independent service updates. The pipeline recreates services with Docker Compose in the same project managed by Portainer. Actions needs no Portainer administrator token.

If `infra/compose.yaml` changes, the pipeline applies it to the VPS. Also update the saved stack-editor definition before a manual Portainer redeployment. Manual redeployment uses the releases pointed to by `current-api`, `current-frontend`, `current-python`, and the saved Portainer definition. The installed script uses the selected commit's definition.

## DNS and TLS

Create Cloudflare A records pointing to `150.230.73.212`:

| Name in prospectordigital.com.br zone | Target |
|---|---|
| `spherex` | `150.230.73.212` |
| `api.spherex` | `150.230.73.212` |
| `lab.spherex` | `150.230.73.212` |

Start in **DNS only** mode (gray cloud). Existing `lets-encrypt` uses TLS-ALPN and must reach VPS port 443 directly for certificate issuance/renewal. Do not enable the orange proxy while using this validation method. Do not create AAAA records without configuring VPS IPv6. Existing Traefik redirects HTTP to HTTPS.

After propagation, verify certificates without `-k`:

```sh
curl --fail https://api.spherex.prospectordigital.com.br/healthz
curl --fail https://spherex.prospectordigital.com.br/healthz
curl -s -o /dev/null -w '%{http_code}\n' https://lab.spherex.prospectordigital.com.br/   # 401 without credentials
```

Frontend builds use `VITE_API_BASE_URL=https://api.spherex.prospectordigital.com.br`. API CORS accepts only `https://spherex.prospectordigital.com.br`. Changing the API domain requires a new frontend build: adjust VPS configuration and publish a new commit to produce a new release SHA.

## Operations

Connect with `ssh ubuntu@150.230.73.212`. On the VPS:

```sh
sudo docker compose --project-name spherex --env-file /opt/docker/spherex/.env -f /opt/docker/spherex/compose.yaml ps
sudo docker compose --project-name spherex --env-file /opt/docker/spherex/.env -f /opt/docker/spherex/compose.yaml logs --tail 100
sudo cat /opt/docker/spherex/current-sha
sudo cat /opt/docker/spherex/api-current-sha
sudo cat /opt/docker/spherex/frontend-current-sha
sudo cat /opt/docker/spherex/python-current-sha
sudo cat /opt/docker/spherex/lab-current-sha
sudo cat /opt/docker/spherex/lab/CREDENTIALS.txt
```

Copy lab exports while preserving hardlinks:

```sh
sudo rsync -aH /opt/docker/spherex/lab/exports/ /destination/path/
```

For administrative rollback, replace `PREVIOUS_SHA` with a full commit still belonging to `main`:

```sh
sudo env SPHEREX_ALLOW_ROLLBACK=1 /usr/local/sbin/spherex-deploy PREVIOUS_SHA stack
```

Rollback is manual through administrative SSH; the Actions key cannot enable this option. The next push to `main` publishes the newly approved version again.

References: [GitHub Actions deployment triggers/concurrency](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/control-deployments), [Traefik Docker-provider labels](https://doc.traefik.io/traefik/reference/routing-configuration/other-providers/docker/), [Traefik TLS-ALPN](https://doc.traefik.io/traefik/reference/install-configuration/tls/certificate-resolvers/acme/#tlschallenge).
