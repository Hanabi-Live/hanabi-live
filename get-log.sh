#!/usr/bin/env bash

set -euo pipefail # Exit on errors and undefined variables.

# Get the directory of this script:
# https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)

REMOTE="root@hanab.live"
REMOTE_LOG_PATH="/root/hanabi-live/logs/hanabi-live.log"
LOCAL_LOG_PATH="$DIR/logs/hanabi-live.log"

# Download the server log.
mkdir -p "$(dirname "$LOCAL_LOG_PATH")"
scp "$REMOTE:$REMOTE_LOG_PATH" "$LOCAL_LOG_PATH"
echo "Downloaded the server log to: $LOCAL_LOG_PATH"
