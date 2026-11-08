#!/usr/bin/env bash

set -o errexit -o nounset -o pipefail

# Get the directory of this script:
# https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)
REPO_ROOT=$(cd -- "$DIR/../.." &> /dev/null && pwd)

cd "$REPO_ROOT"

find . \( -name ".husky" -o -name "dist" -o -name "node_modules" \) -prune -o -type f -name "*.sh" -exec shellcheck {} +
