#!/usr/bin/env bash
set -euo pipefail
umask 022
base=/opt/docker/spherex
repo=https://github.com/GutoValentim/sphereX-planetX-NASA.git
sha=${1:-}
scope=${2:-stack}
[[ $# -ge 1 && $# -le 2 && $sha =~ ^[0-9a-f]{40}$ && $scope =~ ^(api|frontend|stack)$ ]] || {
  echo "Usage: spherex-deploy <commit SHA> [api|frontend|stack]" >&2
  exit 2
}
[[ $EUID == 0 ]] || { echo "Run as root." >&2; exit 2; }
exec 9>"$base/deploy.lock"
flock -w 900 9
mkdir -p "$base/releases/api" "$base/releases/frontend"
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
    case "$file" in
      backend/*)
        if [[ $scope == api || $scope == stack ]]; then superseded=true; fi
        ;;
      frontend/*)
        if [[ $scope == frontend || $scope == stack ]]; then superseded=true; fi
        ;;
      infra/*|package.json|package-lock.json|eslint.config.mjs)
        superseded=true
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
if [[ -f $base/.env ]]; then
  set -a
  source "$base/.env"
  set +a
  frontend_domain=${FRONTEND_DOMAIN:-$frontend_domain}
  api_domain=${API_DOMAIN:-$api_domain}
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
  if ! docker run --rm --name "spherex-build-$component-${sha:0:12}" \
    --memory 1g --cpus 1 --pids-limit 256 \
    -e "BUILD_COMPONENT=$component" \
    -e "VITE_API_BASE_URL=https://$api_domain" \
    -v "$staging:/app" -w /app node:24-bookworm-slim \
    sh -ec '
      npm ci --no-audit --no-fund
      if [ "$BUILD_COMPONENT" = api ]; then
        npx tsc -p backend/tsconfig.json
      else
        npm run build --workspace frontend
      fi
      npm prune --omit=dev --no-audit --no-fund
    '; then
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
  build_release api
  build_release frontend
else
  build_release "$scope"
fi

[[ -f $base/api.env ]] || install -m 600 /dev/null "$base/api.env"
chown 1000:1000 "$base/api.env"
chmod 600 "$base/api.env"

resolve_release_link() {
  local release=
  if [[ -L $1 ]]; then
    release=$(readlink -f "$1" || true)
  fi
  if [[ -d $release ]]; then
    printf '%s' "$release"
  fi
}

legacy_release=$(resolve_release_link "$base/current")
previous_api=$(resolve_release_link "$base/current-api")
previous_api=${previous_api:-$legacy_release}
previous_frontend=$(resolve_release_link "$base/current-frontend")
previous_frontend=${previous_frontend:-$legacy_release}
previous_api_sha=
previous_frontend_sha=
if [[ -n $previous_api && -f $previous_api/.release.env ]]; then
  previous_api_sha=$(sed -n 's/^GIT_SHA=//p' "$previous_api/.release.env")
fi
if [[ -n $previous_frontend && -f $previous_frontend/.release.env ]]; then
  previous_frontend_sha=$(sed -n 's/^GIT_SHA=//p' "$previous_frontend/.release.env")
fi

if [[ $scope != stack ]]; then
  [[ -f $base/.env && -f $base/compose.yaml &&
     -L $base/current-api && -L $base/current-frontend ]] || {
    echo "A successful stack deployment is required before service-only deployments." >&2
    exit 2
  }
  grep -q '^SPHEREX_API_RELEASE_DIR=' "$base/.env" &&
    grep -q '^SPHEREX_FRONTEND_RELEASE_DIR=' "$base/.env" || {
      echo "The active environment does not support independent service releases; deploy the stack first." >&2
      exit 2
    }
fi

if [[ $scope == stack ]]; then
  services=(api frontend)
else
  services=("$scope")
fi
api_release="$base/releases/api/$sha"
frontend_release="$base/releases/frontend/$sha"
backup=$(mktemp -d "$base/.rollback.XXXXXX")
[[ ! -f $base/.env ]] || cp "$base/.env" "$backup/.env"
[[ ! -f $base/compose.yaml ]] || cp "$base/compose.yaml" "$backup/compose.yaml"
for marker in api-current-sha frontend-current-sha current-sha; do
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

deploy_services() {
  docker compose --project-name spherex --env-file "$base/.env" \
    -f "$base/compose.yaml" up -d --force-recreate --wait --wait-timeout 120 "$@"
}

verify_release() {
  local service=$1
  local expected_sha=$2
  local id
  id=$(docker compose --project-name spherex --env-file "$base/.env" \
    -f "$base/compose.yaml" ps -q "$service")
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
  docker exec -e "EXPECTED_GIT_SHA=$expected_sha" "$id" node \
    --env-file=/app/.release.env \
    -e 'fetch("http://127.0.0.1:"+process.env.PORT+"/healthz").then(async r=>{if(!r.ok||(await r.json()).version!==process.env.EXPECTED_GIT_SHA)process.exit(1)}).catch(()=>process.exit(1))'
}

rollback() {
  local status=$?
  trap - EXIT
  if ((status != 0)); then
    echo "Deploy failed; restoring the previous spherex release." >&2
    if [[ $scope == stack ]]; then
      if [[ -f $backup/.env ]]; then cp "$backup/.env" "$base/.env"; else rm -f -- "$base/.env"; fi
      if [[ -f $backup/compose.yaml ]]; then
        cp "$backup/compose.yaml" "$base/compose.yaml"
      else
        rm -f -- "$base/compose.yaml"
      fi
    fi
    for marker in api-current-sha frontend-current-sha current-sha; do
      if [[ -f $backup/$marker ]]; then
        cp "$backup/$marker" "$base/$marker"
      else
        rm -f -- "$base/$marker"
      fi
    done

    local rollback_possible=1
    for service in "${services[@]}"; do
      if [[ $service == api ]]; then
        restore_release api "$previous_api"
        [[ -n $previous_api && -n $previous_api_sha ]] || rollback_possible=0
      else
        restore_release frontend "$previous_frontend"
        [[ -n $previous_frontend && -n $previous_frontend_sha ]] || rollback_possible=0
      fi
    done
    if ((rollback_possible)); then
      if deploy_services "${services[@]}"; then
        for service in "${services[@]}"; do
          if [[ $service == api ]]; then
            verify_release api "$previous_api_sha" || echo "API rollback healthcheck failed." >&2
          else
            verify_release frontend "$previous_frontend_sha" || echo "Frontend rollback healthcheck failed." >&2
          fi
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
  install -m 644 "$api_release/infra/compose.yaml" "$base/compose.yaml"
  {
    printf 'SPHEREX_API_RELEASE_DIR=%s/current-api\n' "$base"
    printf 'SPHEREX_FRONTEND_RELEASE_DIR=%s/current-frontend\n' "$base"
    printf 'FRONTEND_DOMAIN=%s\nAPI_DOMAIN=%s\n' "$frontend_domain" "$api_domain"
  } > "$base/.env.next"
  chmod 600 "$base/.env.next"
  mv "$base/.env.next" "$base/.env"
fi

docker compose --project-name spherex --env-file "$base/.env" \
  -f "$base/compose.yaml" config -q
if [[ $scope == stack || $scope == api ]]; then
  switch_release api "$api_release"
fi
if [[ $scope == stack || $scope == frontend ]]; then
  switch_release frontend "$frontend_release"
fi
deploy_services "${services[@]}"
for service in "${services[@]}"; do
  verify_release "$service" "$sha"
done
for service in "${services[@]}"; do
  printf '%s\n' "$sha" > "$base/$service-current-sha"
done

if [[ $scope == stack || $scope == api ]]; then
  current_api=$(readlink -f "$base/current-api")
  python3 - "$base/releases/api" "$current_api" "$previous_api" <<'PY'
from pathlib import Path
import re
import shutil
import sys

root, current, previous = map(Path, sys.argv[1:])
protected = {current, previous}
releases = sorted(
    (path for path in root.iterdir() if path.is_dir() and re.fullmatch(r"[0-9a-f]{40}", path.name)),
    key=lambda path: path.stat().st_mtime,
    reverse=True,
)
for path in [path for path in releases if path not in protected][3:]:
    shutil.rmtree(path)
PY
fi
if [[ $scope == stack || $scope == frontend ]]; then
  current_frontend=$(readlink -f "$base/current-frontend")
  python3 - "$base/releases/frontend" "$current_frontend" "$previous_frontend" <<'PY'
from pathlib import Path
import re
import shutil
import sys

root, current, previous = map(Path, sys.argv[1:])
protected = {current, previous}
releases = sorted(
    (path for path in root.iterdir() if path.is_dir() and re.fullmatch(r"[0-9a-f]{40}", path.name)),
    key=lambda path: path.stat().st_mtime,
    reverse=True,
)
for path in [path for path in releases if path not in protected][3:]:
    shutil.rmtree(path)
PY
fi
printf '%s\n' "$sha" > "$base/current-sha"
echo "SPHEREx $scope deployed: $sha"
