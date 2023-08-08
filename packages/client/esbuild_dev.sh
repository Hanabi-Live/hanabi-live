#!/bin/bash

set -euo pipefail # Exit on errors and undefined variables.

# Get the directory of this script:
# https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

cd "$DIR"

# Get the "VERSION" environment variable.
# shellcheck disable=SC1091
source "$DIR/get_version.sh"

# We copy the esbuild command from "build_client.sh" and add the "--watch" flag.
REPO_ROOT="$DIR/../.."
JS_BUNDLES_DIR="$REPO_ROOT/public/js/bundles"
JS_BUNDLE_PATH="$JS_BUNDLES_DIR/main.$VERSION.min.js"
npx esbuild "$DIR/src/main.ts" --bundle --outfile="$JS_BUNDLE_PATH" --minify --sourcemap --watch
