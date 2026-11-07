#!/usr/bin/env bash

set -o errexit -o nounset -o pipefail

DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)
REPO_ROOT=$(cd -- "$DIR/../.." &> /dev/null && pwd)
cd "$REPO_ROOT"

# Prettier does not include plugin versions or TypeScript project settings in its file cache.
cache_key=$(sha256sum bun.lock package.json bunfig.toml tsconfig*.json packages/*/tsconfig*.json | sha256sum | cut -d " " -f 1)
bunx --bun --no-install prettier --log-level=warn --check . \
  --cache --cache-strategy content --cache-location ".cache/prettier/$cache_key"
