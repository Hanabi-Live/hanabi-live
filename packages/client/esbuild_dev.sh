#!/usr/bin/env bash

set -euo pipefail # Exit on errors and undefined variables.

# Get the directory of this script:
# https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)

cd "$DIR"

# We copy the esbuild commands from "build_client.sh" and add the "--watch" flag.
REPO_ROOT="$DIR/../.."
JS_BUNDLES_DIR="$REPO_ROOT/public/js/bundles"
# Unlike when in production, we do not append the version number to the bundle. This is because the
# latest Git commit will vary during development and we do not want to have to be forced to restart
# the server in order to update it.
npx esbuild \
  "$DIR/src/main.ts" \
  "$DIR/src/standalone/pips-reference.ts" \
  --bundle \
  --outdir="$JS_BUNDLES_DIR" \
  --entry-names="[name].min" \
  --minify \
  --sourcemap="linked" \
  --watch=forever
