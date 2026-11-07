#!/usr/bin/env bash

# Delete lobby and table chat messages older than one year.

set -o errexit -o nounset -o pipefail

# Redirect all output to syslog.
exec 1> >(logger -s -t "$(basename "$0")") 2>&1

# Get the directory of this script:
# https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)

# Configuration
BATCH_SIZE=10000
VACUUM_EVERY_BATCHES=100

# Import the database information.
ENV_PATH="$DIR/.env"
if [[ ! -f $ENV_PATH ]]; then
  echo "Failed to find the \".env\" file at: $ENV_PATH"
  exit 1
fi
# shellcheck source=/dev/null
source "$ENV_PATH"
if [[ -z ${DB_HOST-} ]]; then
  DB_HOST=localhost
fi
if [[ -z ${DB_PORT-} ]]; then
  DB_PORT=5432
fi

# Failures only reach syslog otherwise, where nobody will see them.
function report_failure {
  local status=$1
  if [[ -z ${DISCORD_TOKEN-} || -z ${DISCORD_CHANNEL_WEBSITE_DEVELOPMENT-} ]]; then
    return
  fi
  # Send the token on stdin so that it does not appear in the process list.
  printf 'header = "Authorization: Bot %s"\n' "$DISCORD_TOKEN" \
    | curl --silent --show-error --fail --output /dev/null --max-time 15 --config - \
      --header "Content-Type: application/json" \
      --data "{\"content\":\"Pruning old chat messages failed with exit code $status. Check the logs with: \`journalctl -t database-prune-chat.sh\`\"}" \
      "https://discord.com/api/v10/channels/$DISCORD_CHANNEL_WEBSITE_DEVELOPMENT/messages" \
    || echo "Failed to report the chat pruning failure to Discord." >&2
}

function on_exit {
  local status=$?
  if ((status != 0)); then
    report_failure "$status"
  fi
}
trap on_exit EXIT

exec 9< "$0"
if ! flock -n 9; then
  echo "Another chat pruning job is already running." >&2
  exit 1
fi

function sql {
  PGPASSWORD="$DB_PASSWORD" psql --host="$DB_HOST" --port="$DB_PORT" --username="$DB_USER" --dbname="$DB_NAME" \
    --no-psqlrc --quiet --tuples-only --no-align --set=ON_ERROR_STOP=1 "$@"
}

# Fix the cutoff once so that every batch uses the same boundary.
CUTOFF=$(sql --command="SELECT NOW() - INTERVAL '1 year'")
echo "Deleting chat messages sent before: $CUTOFF"

# Delete in small batches so that no single transaction holds many row locks or much WAL.
total=0
batches=0
while true; do
  deleted=$(
    sql --set=cutoff="$CUTOFF" --set=batch_size="$BATCH_SIZE" << 'SQL'
WITH deleted AS (
  DELETE FROM chat_log
  WHERE id IN (
    SELECT id FROM chat_log
    WHERE datetime_sent < :'cutoff'
    ORDER BY datetime_sent, id
    LIMIT :batch_size
  )
  RETURNING 1
)
SELECT COUNT(*) FROM deleted;
SQL
  )
  if ((deleted == 0)); then
    break
  fi
  total=$((total + deleted))
  batches=$((batches + 1))
  if ((batches % VACUUM_EVERY_BATCHES == 0)); then
    echo "Deleted $total chat messages so far; vacuuming."
    sql --command="VACUUM chat_log"
  fi
done

if ((total > 0)); then
  sql --command="VACUUM (ANALYZE) chat_log"
fi
echo "Deleted $total chat messages older than one year."
