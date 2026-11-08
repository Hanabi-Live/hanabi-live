#!/usr/bin/env bash

set -o errexit -o nounset -o pipefail

# Get the directory of this script:
# https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)

REPO_ROOT="$DIR/../.."

# Each file directly in "packages/client/src/standalone" is the script of one public page, bundled
# separately as "public/js/bundles/[name].min.js". Arguments go to esbuild, such as
# "--watch=forever".
exec bunx --bun --no-install esbuild \
  "$REPO_ROOT"/packages/client/src/standalone/*.ts \
  --bundle \
  --outdir="$REPO_ROOT/public/js/bundles" \
  --entry-names="[name].min" \
  --minify \
  --sourcemap=linked \
  --format=iife \
  --platform=browser \
  "$@"
