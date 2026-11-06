#!/usr/bin/env bash

set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: $(basename "$0") [username]"
  exit 1
fi

DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)
COMMAND=$(basename "$0" | cut -f 1 -d '.')
source "$DIR/common.sh"
admin_command_post "$COMMAND" "username=$1"
