#!/usr/bin/env bash

set -euo pipefail
DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)
# shellcheck source=/dev/null
source "$DIR/../.env"
export PORT TLS_CERT_FILE TLS_KEY_FILE
cd "$DIR/.."
exec python3 "$DIR/server.py"
