#!/usr/bin/env bash
set -euo pipefail
umask 022
base=/opt/docker/spherex
repo=https://github.com/GutoValentim/sphereX-planetX-NASA.git
node_image=node:24-bookworm-slim
python_image=python:3.12-slim-bookworm
components=(api frontend python lab)
sha=${1:-}
scope=${2:-stack}
[[ $# -ge 1 && $# -le 2 && $sha =~ ^[0-9a-f]{40}$ && $scope =~ ^(api|frontend|python|lab|stack)$ ]] || {
  echo "Usage: spherex-deploy <commit SHA> [api|frontend|python|lab|stack]" >&2
  exit 2
}
[[ $EUID == 0 ]] || { echo "Run as root." >&2; exit 2; }
exec 9>"$base/deploy.lock"
flock -w 900 9
for component in "${components[@]}"; do
  mkdir -p "$base/releases/$component"
done
if [[ ! -d $base/repository.git ]]; then
  git clone --bare "$repo" "$base/repository.git"
fi
git --git-dir="$base/repository.git" fetch --no-tags origin +refs/heads/main:refs/heads/main
git --git-dir="$base/repository.git" merge-base --is-ancestor "$sha" refs/heads/main
latest=$(git --git-dir="$base/repository.git" rev-parse refs/heads/main)
if [[ $sha != "$latest" && ${SPHEREX_ALLOW_ROLLBACK:-0} != 1 ]]; then
  changed_files=$(git --git-dir="$base/repository.git" diff --no-renames --name-only "$sha" "$latest")
  superseded=false
  while IFS= read -r file; do
    # Mesma classificação usada pelo job "changes" do CI.
    case "$file" in
      backend/*.py|backend/requirements*.txt)
        # O laboratório congela o código Python do backend em cada versão do motor.
        if [[ $scope == python || $scope == lab || $scope == stack ]]; then superseded=true; fi
        ;;
      dev/temporal-lab/*)
        if [[ $scope == lab || $scope == stack ]]; then superseded=true; fi
        ;;
      backend/*)
        if [[ $scope == api || $scope == stack ]]; then superseded=true; fi
        ;;
      frontend/*)
        if [[ $scope == frontend || $scope == stack ]]; then superseded=true; fi
        ;;
      infra/*)
        superseded=true
        ;;
      package.json|package-lock.json|eslint.config.mjs)
        if [[ $scope != python && $scope != lab ]]; then superseded=true; fi
        ;;
    esac
  done <<< "$changed_files"
  if [[ $superseded == true ]]; then
    echo "Skipped superseded $scope commit $sha (main=$latest)."
    exit 0
  fi
fi

frontend_domain=spherex.prospectordigital.com.br
api_domain=api.spherex.prospectordigital.com.br
lab_domain=lab.spherex.prospectordigital.com.br
if [[ -f $base/.env ]]; then
  set -a
  source "$base/.env"
  set +a
  frontend_domain=${FRONTEND_DOMAIN:-$frontend_domain}
  api_domain=${API_DOMAIN:-$api_domain}
  lab_domain=${LAB_DOMAIN:-$lab_domain}
fi

build_release() {
  local component=$1
  local release="$base/releases/$component/$sha"
  if [[ -f $release/.build-complete ]]; then
    return
  fi

  local staging
  staging=$(mktemp -d "$base/releases/$component/.build-$sha.XXXXXX")
  chmod 755 "$staging"
  if ! git --git-dir="$base/repository.git" archive "$sha" | tar -x -C "$staging"; then
    rm -rf -- "$staging"
    return 1
  fi
  local built=0
  local python_release="$base/releases/python/$sha"
  if [[ $component == lab && -f $python_release/.build-complete ]]; then
    # Mesmo commit e mesmas dependências do serviço Python: reaproveita a release
    # (o venv usa o caminho /app, o mesmo em que o laboratório é montado).
    cp -a "$python_release/." "$staging/" && rm -f "$staging/.build-complete" && built=1
  elif [[ $component == python || $component == lab ]]; then
    # O venv é criado em /app, o mesmo caminho em que a release é montada em produção.
    docker run --rm --name "spherex-build-$component-${sha:0:12}" \
      --memory 2g --cpus 1 --pids-limit 256 \
      -v "$staging:/app" -w /app "$python_image" \
      sh -ec '
        python -m venv /app/.venv
        /app/.venv/bin/pip install --no-cache-dir --disable-pip-version-check \
          -r backend/requirements.txt
        /app/.venv/bin/python -m compileall -q backend/app
      ' && built=1
  else
    docker run --rm --name "spherex-build-$component-${sha:0:12}" \
      --memory 1g --cpus 1 --pids-limit 256 \
      -e "BUILD_COMPONENT=$component" \
      -e "VITE_API_BASE_URL=https://$api_domain" \
      -v "$staging:/app" -w /app "$node_image" \
      sh -ec '
        npm ci --no-audit --no-fund
        if [ "$BUILD_COMPONENT" = api ]; then
          npx tsc -p backend/tsconfig.json
        else
          npm run build --workspace frontend
        fi
        npm prune --omit=dev --no-audit --no-fund
      ' && built=1
  fi
  if ((!built)); then
    rm -rf -- "$staging"
    return 1
  fi

  printf 'GIT_SHA=%s\n' "$sha" > "$staging/.release.env"
  touch "$staging/.build-complete"
  if [[ -e $release ]]; then
    echo "Incomplete release already exists: $release" >&2
    rm -rf -- "$staging"
    return 1
  fi
  mv "$staging" "$release"
}

if [[ $scope == stack ]]; then
  services=("${components[@]}")
else
  services=("$scope")
fi
for service in "${services[@]}"; do
  build_release "$service"
done

[[ -f $base/api.env ]] || install -m 600 /dev/null "$base/api.env"
chown 1000:1000 "$base/api.env"
chmod 600 "$base/api.env"
# Cache gravável do serviço Python (FITS, manifestos e frames regeneráveis).
mkdir -p "$base/cache"
chown 1000:1000 "$base/cache"
chmod 750 "$base/cache"
# Acervo do laboratório: motores congelados, registros, caches por versão e exportações.
mkdir -p "$base/lab"
chown 1000:1000 "$base/lab"
chmod 750 "$base/lab"

resolve_release_link() {
  local release=
  if [[ -L $1 ]]; then
    release=$(readlink -f "$1" || true)
  fi
  if [[ -d $release ]]; then
    printf '%s' "$release"
  fi
}

upper() { printf '%s' "$1" | tr '[:lower:]' '[:upper:]'; }
# Compatível com bash 3.2 (macOS): variáveis previous_<serviço> em vez de arrays associativos.
previous() { local name="previous_$1"; printf '%s' "${!name}"; }
previous_sha() { local name="previous_sha_$1"; printf '%s' "${!name}"; }

legacy_release=$(resolve_release_link "$base/current")
for component in "${components[@]}"; do
  release=$(resolve_release_link "$base/current-$component")
  # A release única legada só existiu para os serviços Node.
  if [[ ($component == api || $component == frontend) && -z $release ]]; then
    release=$legacy_release
  fi
  release_sha=
  if [[ -n $release && -f $release/.release.env ]]; then
    release_sha=$(sed -n 's/^GIT_SHA=//p' "$release/.release.env")
  fi
  printf -v "previous_$component" '%s' "$release"
  printf -v "previous_sha_$component" '%s' "$release_sha"
done

if [[ $scope != stack ]]; then
  [[ -f $base/.env && -f $base/compose.yaml && -L $base/current-$scope ]] || {
    echo "A successful stack deployment is required before service-only deployments." >&2
    exit 2
  }
  release_var="SPHEREX_$(upper "$scope")_RELEASE_DIR"
  grep -q "^$release_var=" "$base/.env" || {
    echo "The active environment does not support independent $scope releases; deploy the stack first." >&2
    exit 2
  }
fi

backup=$(mktemp -d "$base/.rollback.XXXXXX")
[[ ! -f $base/.env ]] || cp "$base/.env" "$backup/.env"
[[ ! -f $base/compose.yaml ]] || cp "$base/compose.yaml" "$backup/compose.yaml"
markers=(current-sha)
for component in "${components[@]}"; do
  markers+=("$component-current-sha")
done
for marker in "${markers[@]}"; do
  [[ ! -f $base/$marker ]] || cp "$base/$marker" "$backup/$marker"
done

switch_release() {
  local component=$1
  local target=$2
  local next="$base/.current-$component-next"
  ln -sfn "$target" "$next"
  python3 -c 'import os,sys; os.replace(*sys.argv[1:])' "$next" "$base/current-$component"
}

restore_release() {
  local component=$1
  local target=$2
  if [[ -n $target && -d $target ]]; then
    switch_release "$component" "$target"
  else
    rm -f -- "$base/current-$component"
  fi
}

compose() {
  docker compose --project-name spherex --env-file "$base/.env" -f "$base/compose.yaml" "$@"
}

deploy_services() {
  compose up -d --force-recreate --wait --wait-timeout 120 "$@"
}

verify_release() {
  local service=$1
  local expected_sha=$2
  local id
  id=$(compose ps -q "$service")
  [[ -n $id ]] || return 1
  local healthy=0
  for ((attempt=0; attempt<40; attempt++)); do
    if [[ $(docker inspect -f '{{.State.Health.Status}}' "$id") == healthy ]]; then
      healthy=1
      break
    fi
    sleep 2
  done
  [[ $healthy == 1 ]] || return 1
  if [[ $service == python || $service == lab ]]; then
    local health_url=http://127.0.0.1:8000/healthz
    [[ $service == lab ]] && health_url='http://127.0.0.1:8765/api/health?light=1'
    docker exec -e "EXPECTED_GIT_SHA=$expected_sha" -e "HEALTH_URL=$health_url" "$id" /app/.venv/bin/python -c \
      'import json,os,urllib.request; r=json.load(urllib.request.urlopen(os.environ["HEALTH_URL"], timeout=5)); raise SystemExit(r.get("version") != os.environ["EXPECTED_GIT_SHA"])'
  else
    docker exec -e "EXPECTED_GIT_SHA=$expected_sha" "$id" node \
      --env-file=/app/.release.env \
      -e 'fetch("http://127.0.0.1:"+process.env.PORT+"/healthz").then(async r=>{if(!r.ok||(await r.json()).version!==process.env.EXPECTED_GIT_SHA)process.exit(1)}).catch(()=>process.exit(1))'
  fi
}

rollback() {
  local status=$?
  trap - EXIT
  if ((status != 0)); then
    echo "Deploy failed; restoring the previous spherex release." >&2
    local restorable=() discard=()
    for service in "${services[@]}"; do
      if [[ -n $(previous "$service") && -n $(previous_sha "$service") ]]; then
        restorable+=("$service")
      else
        discard+=("$service")
      fi
    done
    # Serviços sem release anterior (ex.: primeiro deploy do Python) são removidos
    # com o compose candidato, antes de restaurar o compose anterior.
    if ((${#discard[@]})); then
      compose rm -sf "${discard[@]}" >/dev/null 2>&1 ||
        echo "Could not remove new services: ${discard[*]}" >&2
    fi
    if [[ $scope == stack ]]; then
      if [[ -f $backup/.env ]]; then cp "$backup/.env" "$base/.env"; else rm -f -- "$base/.env"; fi
      if [[ -f $backup/compose.yaml ]]; then
        cp "$backup/compose.yaml" "$base/compose.yaml"
      else
        rm -f -- "$base/compose.yaml"
      fi
    fi
    for marker in "${markers[@]}"; do
      if [[ -f $backup/$marker ]]; then
        cp "$backup/$marker" "$base/$marker"
      else
        rm -f -- "$base/$marker"
      fi
    done

    for service in "${services[@]}"; do
      restore_release "$service" "$(previous "$service")"
    done
    if ((${#restorable[@]})); then
      if deploy_services "${restorable[@]}"; then
        for service in "${restorable[@]}"; do
          verify_release "$service" "$(previous_sha "$service")" ||
            echo "$service rollback healthcheck failed." >&2
        done
      else
        echo "Automatic rollback failed; inspect the spherex stack." >&2
      fi
    else
      echo "No previous complete release was available for automatic rollback." >&2
    fi
  fi
  rm -rf -- "$backup"
  exit "$status"
}
trap rollback EXIT

if [[ $scope == stack ]]; then
  install -m 644 "$base/releases/api/$sha/infra/compose.yaml" "$base/compose.yaml"
  {
    for component in "${components[@]}"; do
      printf 'SPHEREX_%s_RELEASE_DIR=%s/current-%s\n' "$(upper "$component")" "$base" "$component"
    done
    printf 'FRONTEND_DOMAIN=%s\nAPI_DOMAIN=%s\nLAB_DOMAIN=%s\n' "$frontend_domain" "$api_domain" "$lab_domain"
  } > "$base/.env.next"
  chmod 600 "$base/.env.next"
  mv "$base/.env.next" "$base/.env"
fi

compose config -q
for service in "${services[@]}"; do
  switch_release "$service" "$base/releases/$service/$sha"
done
deploy_services "${services[@]}"
for service in "${services[@]}"; do
  verify_release "$service" "$sha"
done
for service in "${services[@]}"; do
  printf '%s\n' "$sha" > "$base/$service-current-sha"
done

for service in "${services[@]}"; do
  current=$(readlink -f "$base/current-$service")
  python3 - "$base/releases/$service" "$current" "$(previous "$service")" <<'PY'
from pathlib import Path
import re
import shutil
import sys

root, current, previous = Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3]
protected = {current} | ({Path(previous)} if previous else set())
releases = sorted(
    (path for path in root.iterdir() if path.is_dir() and re.fullmatch(r"[0-9a-f]{40}", path.name)),
    key=lambda path: path.stat().st_mtime,
    reverse=True,
)
for path in [path for path in releases if path not in protected][3:]:
    shutil.rmtree(path)
PY
done
printf '%s\n' "$sha" > "$base/current-sha"
echo "SPHEREx $scope deployed: $sha"
