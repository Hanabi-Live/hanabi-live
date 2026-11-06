#!/usr/bin/env bash

set -euo pipefail

# Get the directory of this script:
# https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)

# shellcheck source=/dev/null
source "$DIR/common.sh"
admin_command gracefulRestart
