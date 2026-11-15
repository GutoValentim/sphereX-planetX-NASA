#!/usr/bin/env bash
set -euo pipefail
# Installed root-owned at /usr/local/bin/spherex-ssh-deploy.
if [[ ${SSH_ORIGINAL_COMMAND:-} =~ ^deploy\ ([0-9a-f]{40})(\ (api|frontend|python|stack))?$ ]]; then
  exec sudo -n /usr/local/sbin/spherex-deploy \
    "${BASH_REMATCH[1]}" "${BASH_REMATCH[3]:-stack}"
fi
echo "Only 'deploy <40-character commit SHA> [api|frontend|python|stack]' is allowed." >&2
exit 1
