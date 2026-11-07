#!/usr/bin/env bash

set -euo pipefail

for argument in "$@"; do
  case "$argument" in
    --check | --apply-migrations) ;;
    -h | --help)
      echo "Usage: $0 [--check] [--apply-migrations]"
      echo "Deploy approved main to root@hanab.live:/root/hanabi-live over SSH."
      echo "--check verifies without deploying; --apply-migrations approves pending migrations."
      exit 0
      ;;
    *)
      printf 'Unknown argument: %s\n' "$argument" >&2
      exit 2
      ;;
  esac
done

DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)

echo "Deployment target: root@hanab.live:/root/hanabi-live"
# Send credentials on encrypted stdin, never in SSH command-line arguments.
if {
  token=${GH_TOKEN:-${GITHUB_TOKEN_PERSONAL_CLASSIC:-${GITHUB_TOKEN:-}}}
  if [[ -n $token ]]; then
    printf 'export GH_TOKEN=%q\n' "$token"
  fi
  cat << 'REMOTE'
set -euo pipefail
cd /root/hanabi-live
python=python3
if [[ -x /opt/hanabi-python/bin/python3 ]]; then
  python=/opt/hanabi-python/bin/python3
fi
tools=$(mktemp -d)
trap 'rm -f "$tools/deploy_rust.py" "$tools/release.py"; rmdir "$tools"' EXIT
REMOTE
  # Use matching local tooling even when production still runs an older release format.
  for name in deploy_rust release; do
    printf '%s\n' "cat > \"\$tools/$name.py\" << 'HANABI_DEPLOY_TOOL'"
    cat "$DIR/install/$name.py"
    printf '\nHANABI_DEPLOY_TOOL\n'
  done
  cat << 'REMOTE'
"$python" -B "$tools/deploy_rust.py" "$@"
REMOTE
} | ssh -T root@hanab.live "bash -l -s -- $*"; then
  exit 0
else
  status=$?
  if [[ $status == 255 ]]; then
    echo "SSH failed; deployment outcome is unknown. Do not retry or roll back automatically." >&2
    echo "Inspect /root/hanabi-live/backups/deploy-rust-*/deployment.json and server health on production first." >&2
  fi
  exit "$status"
fi
