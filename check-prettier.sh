#!/usr/bin/env bash

set -euo pipefail

DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)
cd "$DIR"

# Prettier does not include plugin versions or TypeScript project settings in its file cache.
cache_key=$(sha256sum bun.lock package.json bunfig.toml tsconfig*.json packages/*/tsconfig*.json misc/*/tsconfig*.json | sha256sum | cut -d " " -f 1)
bunx --bun --no-install prettier --log-level=warn --check . \
  --cache --cache-strategy content --cache-location ".cache/prettier/$cache_key"
