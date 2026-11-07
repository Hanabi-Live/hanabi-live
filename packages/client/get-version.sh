#!/usr/bin/env bash

set -o errexit -o nounset -o pipefail

# Get the directory of this script:
# https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)

REPO_ROOT="$DIR/../.."

cd "$REPO_ROOT"

# Embed the source revision so the server can reject clients from a different release.
export VERSION
if [[ -v HANABI_BUILD_REVISION ]]; then
  VERSION="$HANABI_BUILD_REVISION"
else
  VERSION=$(git rev-parse HEAD)
fi
if [[ ! $VERSION =~ ^[a-f0-9]{40}$ ]]; then
  echo "The build revision must be a full lowercase Git SHA." >&2
  exit 1
fi
if [[ ${BASH_SOURCE[0]} == "$0" ]]; then
  printf '%s\n' "$VERSION"
fi
