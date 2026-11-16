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
# The command takes only POST, with the message in the query string.
arguments=(--request POST)
if [[ $# -eq 1 ]]; then
  arguments+=(--get --data-urlencode "message=$1")
fi
admin_request "http://localhost:$LOCALHOST_PORT/$COMMAND" "${arguments[@]}"
