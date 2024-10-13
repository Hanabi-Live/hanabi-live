#!/bin/bash

set -euo pipefail # Exit on errors and undefined variables.

# Get the directory of this script:
# https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

# shellcheck disable=SC1091
source "$DIR/get_version.sh"

VERSION_PATH="$REPO_ROOT/packages/data/src/version.js"
echo "// @ts-nocheck" > "$VERSION_PATH"
echo >> "$VERSION_PATH"
echo "module.exports = { VERSION: \"$VERSION\" };" >> "$VERSION_PATH"
