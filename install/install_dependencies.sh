#!/bin/bash

set -euo pipefail # Exit on errors and undefined variables.
set -x # Enable debugging so that developers can more easily see where errors occur.

# Get the directory of this script:
# https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

REPO_ROOT="$DIR/.."

# Ensure that the ".env" file exists.
if [[ ! -f "$REPO_ROOT/.env" ]]; then
  cp "$REPO_ROOT/.env.example" "$REPO_ROOT/.env"
fi

# Install the JavaScript/TypeScript dependencies and build the client.
cd "$REPO_ROOT"
npm install -g npm@latest
npm ci
npm run prepare
bash "$REPO_ROOT/packages/client/build_client.sh"

# Build the server, which will automatically install the Golang dependencies.
bash "$REPO_ROOT/server/build_server.sh"

echo "Successfully installed dependencies."
