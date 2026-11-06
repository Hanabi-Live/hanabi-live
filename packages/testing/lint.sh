#!/usr/bin/env bash
set -euo pipefail
DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)
cd "$DIR"
bunx --bun --no-install tsc --noEmit
bunx --bun --no-install eslint --max-warnings 0 .
