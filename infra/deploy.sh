#!/usr/bin/env bash
set -euo pipefail
umask 022
base=/opt/docker/spherex
repo=https://github.com/GutoValentim/sphereX-planetX-NASA.git
sha=${1:-}
[[ $# == 1 && $sha =~ ^[0-9a-f]{40}$ ]] || { echo "Usage: spherex-deploy <commit SHA>" >&2; exit 2; }
[[ $EUID == 0 ]] || { echo "Run as root." >&2; exit 2; }
exec 9>"$base/deploy.lock"
flock -w 900 9
mkdir -p "$base/releases"
if [[ ! -d $base/repository.git ]]; then
  git clone --bare "$repo" "$base/repository.git"
fi
git --git-dir="$base/repository.git" fetch --prune origin main:refs/heads/main
git --git-dir="$base/repository.git" merge-base --is-ancestor "$sha" refs/heads/main
latest=$(git --git-dir="$base/repository.git" rev-parse refs/heads/main)
if [[ $sha != "$latest" && ${SPHEREX_ALLOW_ROLLBACK:-0} != 1 ]]; then
  echo "Skipped superseded commit $sha (main=$latest)."
  exit 0
fi

frontend_domain=spherex.prospectordigital.com.br
api_domain=api.spherex.prospectordigital.com.br
if [[ -f $base/.env ]]; then
  # This file is root-owned host configuration, never loaded from the repository.
  set -a
  source "$base/.env"
  set +a
  frontend_domain=${FRONTEND_DOMAIN:-$frontend_domain}
  api_domain=${API_DOMAIN:-$api_domain}
fi
release="$base/releases/$sha"
if [[ ! -f $release/.build-complete ]]; then
  staging=$(mktemp -d "$base/releases/.build-$sha.XXXXXX")
  chmod 755 "$staging"
  trap 'rm -rf -- "$staging"' EXIT
  git --git-dir="$base/repository.git" archive "$sha" | tar -x -C "$staging"
  docker run --rm --name "spherex-build-${sha:0:12}" \
    --memory 1g --cpus 1 --pids-limit 256 \
    -e "VITE_API_BASE_URL=https://$api_domain" \
    -v "$staging:/app" -w /app node:24-bookworm-slim \
    sh -ec 'npm ci --no-audit --no-fund && npm run build && npm prune --omit=dev --no-audit --no-fund'
  printf 'GIT_SHA=%s\n' "$sha" > "$staging/.release.env"
  touch "$staging/.build-complete"
  [[ ! -e $release ]] || { echo "Incomplete release already exists: $release" >&2; exit 1; }
  mv "$staging" "$release"
  trap - EXIT
fi
[[ -f $base/api.env ]] || install -m 600 /dev/null "$base/api.env"
chown 1000:1000 "$base/api.env"
chmod 600 "$base/api.env"
backup=$(mktemp -d "$base/.rollback.XXXXXX")
[[ ! -f $base/.env ]] || cp "$base/.env" "$backup/.env"
[[ ! -f $base/compose.yaml ]] || cp "$base/compose.yaml" "$backup/compose.yaml"
previous=$(readlink -f "$base/current" || true)

deploy_stack() {
  docker compose --project-name spherex --env-file "$base/.env" -f "$base/compose.yaml" up -d --force-recreate --wait --wait-timeout 120
}
switch_release() {
  ln -sfn "$1" "$base/.current-next"
  python3 -c 'import os,sys; os.replace(*sys.argv[1:])' "$base/.current-next" "$base/current"
}
verify_release() {
  local service id
  for service in api frontend; do
    id=$(docker compose --project-name spherex --env-file "$base/.env" -f "$base/compose.yaml" ps -q "$service")
    [[ -n $id ]] || return 1
    local healthy=0
    for ((attempt=0; attempt<40; attempt++)); do
      if [[ $(docker inspect -f '{{.State.Health.Status}}' "$id") == healthy ]]; then healthy=1; break; fi
      sleep 2
    done
    [[ $healthy == 1 ]] || return 1
    docker exec "$id" node --env-file=/app/.release.env -e 'fetch("http://127.0.0.1:"+process.env.PORT+"/healthz").then(async r=>{if(!r.ok||(await r.json()).version!==process.env.GIT_SHA)process.exit(1)}).catch(()=>process.exit(1))' || return 1
  done
}
rollback() {
  local status=$?
  trap - EXIT
  if ((status != 0)) && [[ -d $previous && -f $backup/.env && -f $backup/compose.yaml ]]; then
    echo "Deploy failed; restoring the previous spherex release." >&2
    cp "$backup/.env" "$base/.env"
    cp "$backup/compose.yaml" "$base/compose.yaml"
    switch_release "$previous"
    deploy_stack && verify_release || echo "Automatic rollback failed; inspect the spherex stack." >&2
  fi
  rm -rf -- "$backup"
  exit "$status"
}
trap rollback EXIT
install -m 644 "$release/infra/compose.yaml" "$base/compose.yaml"
{
  printf 'SPHEREX_RELEASE_DIR=%s/current\n' "$base"
  printf 'FRONTEND_DOMAIN=%s\nAPI_DOMAIN=%s\n' "$frontend_domain" "$api_domain"
} > "$base/.env.next"
chmod 600 "$base/.env.next"
mv "$base/.env.next" "$base/.env"
docker compose --project-name spherex --env-file "$base/.env" -f "$base/compose.yaml" config -q
switch_release "$release"
deploy_stack
verify_release
# Retain the active and previous releases, plus the three newest others.
python3 - "$base/releases" "$release" "$previous" <<'PY'
from pathlib import Path
import re
import shutil
import sys
root, current, previous = map(Path, sys.argv[1:])
protected = {current, previous}
releases = sorted((p for p in root.iterdir() if p.is_dir() and re.fullmatch(r"[0-9a-f]{40}", p.name)), key=lambda p: p.stat().st_mtime, reverse=True)
for path in [p for p in releases if p not in protected][3:]:
    shutil.rmtree(path)
PY
echo "$sha" > "$base/current-sha"
echo "SPHEREx deployed: $sha"
