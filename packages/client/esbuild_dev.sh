#!/bin/bash

set -euo pipefail # Exit on errors and undefined variables.

# Get the directory of this script:
# https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

cd "$DIR"

# We copy the esbuild command from "build_client.sh" and add the "--watch" flag.
REPO_ROOT="$DIR/../.."
JS_BUNDLES_DIR="$REPO_ROOT/public/js/bundles"
# Unlike when in production, we do not append the version number to the bundle. This is because the
# latest Git commit will vary during development and we do not want to have to be forced to restart
# the server in order to update it.
JS_BUNDLE_PATH="$JS_BUNDLES_DIR/main.min.js"
npx esbuild "$DIR/src/main.ts" --bundle --outfile="$JS_BUNDLE_PATH" --minify  --sourcemap="linked" --watch
