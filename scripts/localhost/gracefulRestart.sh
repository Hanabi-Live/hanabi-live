#!/usr/bin/env bash

set -o errexit -o nounset -o pipefail

if [[ $# -gt 1 ]]; then
  echo "usage: $(basename "$0") [message]"
  echo "The optional message explains the downtime to connected users and on Discord."
  exit 1
fi

DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)
COMMAND=$(basename "$0" | cut -f 1 -d '.')
source "$DIR/common.sh"
if [[ $# -eq 1 ]]; then
  admin_request "http://localhost:$LOCALHOST_PORT/$COMMAND" --get --data-urlencode "message=$1"
else
  admin_command "$COMMAND"
fi
