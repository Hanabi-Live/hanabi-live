#!/usr/bin/env bash

set -o errexit -o nounset -o pipefail

# Get the directory of this script:
# https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)

# shellcheck disable=SC1091
source "$DIR/get-version.sh"

VERSION_PATH="$REPO_ROOT/packages/data/src/version.js"
echo "// @ts-nocheck" > "$VERSION_PATH"
echo >> "$VERSION_PATH"
echo "export const VERSION = \"$VERSION\";" >> "$VERSION_PATH"
