#!/usr/bin/env bash

set -euo pipefail # Exit on errors and undefined variables.
set -x            # Enable debugging so that developers can more easily see where errors occur.

# Get the directory of this script:
# https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)

REPO_ROOT="$DIR/.."

# Ensure that the ".env" file exists.
if [[ ! -f "$REPO_ROOT/.env" ]]; then
  cp "$REPO_ROOT/.env.example" "$REPO_ROOT/.env"
fi

# Install the JavaScript/TypeScript dependencies and build the client.
cd "$REPO_ROOT"
export PATH="${BUN_INSTALL:-${HOME:-/root}/.bun}/bin:$PATH"
if ! command -v bun > /dev/null; then
  echo "Install Bun using docs/install.md before installing project dependencies." >&2
  exit 1
fi
bun install --frozen-lockfile
bash "$REPO_ROOT/packages/client/build-client.sh"

# Build the native server using its pinned Rust toolchain.
bash "$REPO_ROOT/server/build-server.sh"

echo "Successfully installed dependencies."
