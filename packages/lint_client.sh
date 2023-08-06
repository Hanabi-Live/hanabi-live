#!/bin/bash

set -euo pipefail # Exit on errors and undefined variables.

# Get the directory of this script:
# https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

SECONDS=0

bash "$DIR/client/lint.sh"
bash "$DIR/data/lint.sh"
bash "$DIR/utils/lint.sh"

echo "Successfully linted the client packages in $SECONDS seconds."
