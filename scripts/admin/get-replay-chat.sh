#!/usr/bin/env bash

# Print the chat history for a shared replay.

set -o errexit -o nounset -o pipefail

if [[ $# -ne 1 || ! $1 =~ ^[1-9][0-9]*$ ]]; then
  echo "usage: $(basename "$0") [shared replay table ID]"
  exit 1
fi
ROOM="table$1"

DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)
# shellcheck source=../lib/database.sh
source "$DIR/../lib/database.sh"

sql --set=room="$ROOM" << 'SQL'
SELECT
  '[' || to_char(chat_log.datetime_sent AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') || '] '
  || CASE
    WHEN users.username IS NOT NULL THEN users.username
    WHEN chat_log.discord_name IS NOT NULL THEN chat_log.discord_name || ' (Discord)'
    WHEN chat_log.source = 'server' THEN 'Server'
    ELSE 'Deleted user #' || chat_log.user_id
  END
  || ': ' || chat_log.message
FROM chat_log
LEFT JOIN users ON users.id = chat_log.user_id
WHERE chat_log.room = :'room'
ORDER BY chat_log.datetime_sent, chat_log.id;
SQL
