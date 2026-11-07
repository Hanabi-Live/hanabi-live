#!/usr/bin/env bash

set -o errexit -o nounset -o pipefail

DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)
COMMAND=$(basename "$0" | cut -f 1 -d '.')
source "$DIR/common.sh"
admin_command "$COMMAND"
