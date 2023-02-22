#!/bin/bash

set -euo pipefail # Exit on errors and undefined variables.

# Get the directory of this script:
# https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

bash "$DIR/packages/lint_client.sh"
# Linting of the server is disabled until it is rewritten in TypeScript.
#bash "$DIR/server/lint_server.sh"
