#!/usr/bin/env bash

set -euo pipefail
DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)
cd "$DIR"

python=python3
if [[ -x /opt/hanabi-python/bin/python3 ]]; then
  python=/opt/hanabi-python/bin/python3
fi
exec "$python" install/deploy_rust.py "$@"
