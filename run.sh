#!/usr/bin/env bash

set -o errexit -o nounset -o pipefail

# Get the directory of this script:
# https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)

# Ensure that the "logs" directory exists.
mkdir -p "$DIR/logs"

bash "$DIR/server/build-server.sh"
cd "$DIR"
exec "$DIR/hanabi-live"
