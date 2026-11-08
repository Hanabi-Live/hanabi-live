#!/usr/bin/env bash

set -o errexit -o nounset -o pipefail

# Get the directory of this script:
# https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)
REPO_ROOT=$(cd -- "$DIR/../.." &> /dev/null && pwd)

cd "$REPO_ROOT"

# Spell check every file using CSpell.
# "--no-progress" and "--no-summary" make it only output errors.
cache_key=$(sha256sum bun.lock package.json bunfig.toml | sha256sum | cut -d " " -f 1)
bunx --bun --no-install cspell \
  --no-progress \
  --no-summary \
  --cache \
  --cache-strategy content \
  --cache-location ".cache/cspell/$cache_key" \
  .
