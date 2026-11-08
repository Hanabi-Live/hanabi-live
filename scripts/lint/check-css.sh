#!/usr/bin/env bash

set -o errexit -o nounset -o pipefail

# Get the directory of this script:
# https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)
REPO_ROOT=$(cd -- "$DIR/../.." &> /dev/null && pwd)
CLIENT_DIR="$REPO_ROOT/packages/client"

# Minify the CSS bundle as the client build does, which fails on any CSS that the minifier cannot
# parse.
cd "$CLIENT_DIR"
trap 'rm -rf "$CLIENT_DIR/grunt_output"' EXIT
bunx --bun --no-install grunt
