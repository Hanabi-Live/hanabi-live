#!/usr/bin/env bash
set -o errexit -o nounset -o pipefail
DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)
cd "$DIR"
bunx --bun --no-install vite build
