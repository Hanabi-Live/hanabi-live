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

echo "Deployment target: root@hanab.live:/root/hanabi-live"
# Only the fixed flags above may enter the remote shell command.
if ssh -T root@hanab.live "bash -l -s -- $*" << 'REMOTE'; then
set -euo pipefail
cd /root/hanabi-live
python=python3
if [[ -x /opt/hanabi-python/bin/python3 ]]; then
  python=/opt/hanabi-python/bin/python3
fi
exec "$python" install/deploy_rust.py "$@"
REMOTE
  exit 0
else
  status=$?
  if [[ $status == 255 ]]; then
    echo "SSH failed; deployment outcome is unknown. Do not retry or roll back automatically." >&2
    echo "Inspect /root/hanabi-live/backups/deploy-rust-*/deployment.json and server health on production first." >&2
  fi
  exit "$status"
fi
