#!/bin/bash

set -euo pipefail # Exit on errors and undefined variables.

# Get the directory of this script:
# https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)
REPO_ROOT="$DIR/../.."

echo "Building pips reference page..."

# Build the TypeScript file to JavaScript using esbuild
npx esbuild "$REPO_ROOT/packages/client/src/pips-reference.ts" \
  --bundle \
  --outfile="$REPO_ROOT/public/js/bundles/pips-reference.min.js" \
  --minify \
  --sourcemap=linked \
  --format=iife \
  --platform=browser

echo "Build complete! Open public/pips-reference.html in a browser to view."
