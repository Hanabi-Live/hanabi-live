#!/bin/bash

set -euo pipefail # Exit on errors and undefined variables.

# Get the directory of this script:
# https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

SECONDS=0

# Client
bash "$DIR/packages/client/lint.sh"
bash "$DIR/packages/data/lint.sh"
bash "$DIR/packages/game/lint.sh"
bash "$DIR/packages/server/lint.sh"
bash "$DIR/packages/utils/lint.sh"

# Server
# Linting of the server is disabled until it is rewritten in TypeScript.
#bash "$DIR/server/lint_server.sh"

echo "Successfully linted the client packages in $SECONDS seconds."
