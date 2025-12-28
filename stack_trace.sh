#!/bin/bash

set -euo pipefail # Exit on errors and undefined variables.

# Get the directory of this script:
# https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)

cd "$DIR"

REPO_ROOT="$DIR"
JS_BUNDLES_DIR="$REPO_ROOT/public/js/bundles"
VERSION=$(git rev-list --count HEAD)
JS_BUNDLE_PATH="$JS_BUNDLES_DIR/main.$VERSION.min.js"
JS_BUNDLE_MAP_PATH="$JS_BUNDLE_PATH.map"

if [[ ! -f $JS_BUNDLE_MAP_PATH ]]; then
  echo "The JavaScript bundle map does not exist at: $JS_BUNDLE_MAP_PATH"
  echo "Try running the \"build_client.sh\" script."
  exit 1
fi

# https://github.com/mifi/stacktracify
npx stacktracify "$JS_BUNDLE_MAP_PATH"
