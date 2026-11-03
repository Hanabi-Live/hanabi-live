#!/usr/bin/env bash
# cspell:words vite
set -euo pipefail
DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)
cd "$DIR"
npx vite build
