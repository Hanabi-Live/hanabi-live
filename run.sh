#!/usr/bin/env bash

set -euo pipefail # Exit on errors and undefined variables.

# Get the directory of this script:
# https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)

# Ensure that the "logs" directory exists.
# (If it does not exist, Supervisor will fail to start the service.)
mkdir -p "$DIR/logs"

bash "$DIR/server/build_server.sh"
cd "$DIR"
exec "$DIR/hanabi-live"
