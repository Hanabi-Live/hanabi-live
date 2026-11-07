#!/usr/bin/env bash

set -o errexit -o nounset -o pipefail

# Get the directory of this script:
# https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)

REMOTE="root@hanab.live"
LOCAL_LOG_PATH="$DIR/logs/hanabi-live.log"

# Download the server log.
mkdir -p "$(dirname "$LOCAL_LOG_PATH")"
ssh "$REMOTE" 'if systemctl cat hanabi-live &> /dev/null; then journalctl --unit=hanabi-live --no-pager --output=cat; else cat /root/hanabi-live/logs/hanabi-live.log; fi' > "$LOCAL_LOG_PATH"
echo "Downloaded the server log to: $LOCAL_LOG_PATH"
