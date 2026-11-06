#!/usr/bin/env bash

set -euo pipefail # Exit on errors and undefined variables.

# Get the directory of this script:
# https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)

REPO_ROOT="$DIR/../.."

cd "$REPO_ROOT"

# Embed the source revision so the server can reject clients from a different release.
export VERSION
VERSION=$(git rev-parse HEAD)
