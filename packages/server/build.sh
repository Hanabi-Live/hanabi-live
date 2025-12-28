#!/bin/bash

set -euo pipefail # Exit on errors and undefined variables.

# Get the directory of this script:
# https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)

# Get the name of the package:
# https://stackoverflow.com/questions/23162299/how-to-get-the-last-part-of-dirname-in-bash/23162553
PACKAGE_NAME="$(basename "$DIR")"

echo "Building: $PACKAGE_NAME"

SECONDS=0

cd "$DIR"

# See the comment in "esbuild.mjs".
REPO_ROOT="$DIR/../.."
cd "$REPO_ROOT"
node "$DIR/esbuild.config.mjs"

echo "Successfully built $PACKAGE_NAME in $SECONDS seconds."
