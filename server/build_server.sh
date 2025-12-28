#!/bin/bash

set -euo pipefail # Exit on errors and undefined variables.

# Get the directory of this script:
# https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)

# Get the name of the repository:
# https://stackoverflow.com/questions/23162299/how-to-get-the-last-part-of-dirname-in-bash/23162553
REPO_ROOT_PATH="$(dirname "$DIR")"
REPO_NAME="$(basename "$REPO_ROOT_PATH")"

SECONDS=0

# For non-interactive shells (e.g. the server running this script to build itself),
# the "HOME" environment variable must be specified or there will be a cache error when compiling
# the Go code.
if [[ -z ${HOME-} ]] && [[ -z ${CI-} ]]; then
  export HOME=/root
fi

if ! command -v go &> /dev/null; then
  export PATH="$PATH:/usr/local/go/bin"
fi

# Compile the Golang code
cd "$DIR/src"
go build -o "$REPO_ROOT_PATH/$REPO_NAME"
echo "Successfully built $REPO_NAME Golang server in $SECONDS seconds."
