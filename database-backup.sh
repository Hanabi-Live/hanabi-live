#!/usr/bin/env bash

set -o errexit -o nounset -o pipefail
umask 077

# Redirect all output to syslog (but skip this if we are on Windows).
# https://www.urbanautomaton.com/blog/2014/09/09/redirecting-bash-script-output-to-syslog/
if uname -a | grep -v MINGW64 > /dev/null 2>&1; then
  exec 1> >(logger -s -t "$(basename "$0")") 2>&1
fi

# Get the directory of this script:
# https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)

# Get the name of the repository:
# https://stackoverflow.com/questions/23162299/how-to-get-the-last-part-of-dirname-in-bash/23162553
REPO_NAME="$(basename "$DIR")"

# Configuration
BACKUPS_DIR="$DIR/backups"
FILENAME=$REPO_NAME-$(date +%s).sql.gz # "date +%s" returns the epoch timestamp.

# shellcheck source=scripts/lib/env.sh
source "$DIR/scripts/lib/env.sh"

# Failures only reach syslog otherwise, where nobody will see them.
function report_failure {
  local status=$1 reason=${FAILURE:-"The cause is unknown."}
  if [[ -z ${DISCORD_TOKEN-} || -z ${DISCORD_CHANNEL_WEBSITE_DEVELOPMENT-} ]]; then
    echo "Discord is not configured, so this failure was not reported." >&2
    return
  fi
  # Shorten, then escape the reason for JSON.
  reason=${reason:0:300}
  reason=${reason//\\/\\\\}
  reason=${reason//\"/\\\"}
  reason=${reason//[$'\t\n\r']/ }
  # Send the token on stdin so that it does not appear in the process list.
  printf 'header = "Authorization: Bot %s"\n' "$DISCORD_TOKEN" \
    | curl --silent --show-error --fail --output /dev/null --max-time 15 --config - \
      --header "Content-Type: application/json" \
      --data "{\"content\":\"The database backup failed with exit code $status: $reason\\nCheck the logs with: \`journalctl -t database-backup.sh\`\"}" \
      "https://discord.com/api/v10/channels/$DISCORD_CHANNEL_WEBSITE_DEVELOPMENT/messages" \
    || echo "Failed to report the backup failure to Discord." >&2
}

# Expected failures explain themselves. Others are named by the ERR trap, which records commands as
# written, without expanding variables, so no secrets reach the alert.
FAILURE=""
function fail {
  FAILURE=$1
  echo "$1" >&2
  exit 1
}
set -o errtrace
trap 'FAILURE=${FAILURE:-"Line $LINENO failed: $BASH_COMMAND"}' ERR

PARTIAL_PATH=""
function on_exit {
  local status=$?
  if [[ -n $PARTIAL_PATH ]]; then
    rm -f -- "$PARTIAL_PATH"
  fi
  if ((status != 0)); then
    report_failure "$status"
  fi
}
trap on_exit EXIT
trap 'FAILURE="The backup was interrupted."; exit 130' INT
trap 'FAILURE="The backup was terminated."; exit 143' TERM

mkdir -p "$BACKUPS_DIR"
MAX_BACKUP_KB=""
if uname -a | grep -v MINGW64 > /dev/null 2>&1; then
  exec 9> "$BACKUPS_DIR/.backup.lock"
  if ! flock -n 9; then
    fail "Another database backup is already running."
  fi
  AVAILABLE_KB=$(df -Pk "$BACKUPS_DIR" | awk 'NR == 2 { print $4 }')
  # Leave at least 1 GiB for PostgreSQL and application writes.
  MAX_BACKUP_KB=$((AVAILABLE_KB - 1048576))
  if ((MAX_BACKUP_KB <= 0)); then
    fail "Not enough disk space for a backup while preserving 1 GiB of free space."
  fi
fi

function sql {
  PGPASSWORD="$DB_PASSWORD" psql --host="$DB_HOST" --port="$DB_PORT" --username="$DB_USER" --dbname="$DB_NAME" \
    --no-psqlrc --quiet --tuples-only --no-align --set=ON_ERROR_STOP=1 "$@"
}

# Delete chat older than one year in small batches, so that no single transaction holds many row
# locks or much WAL.
function delete_old_chat {
  local cutoff deleted total=0 batches=0
  # Fix the cutoff once so that every batch uses the same boundary.
  cutoff=$(sql --command="SELECT NOW() - INTERVAL '1 year'")
  echo "Deleting chat messages sent before: $cutoff"
  while true; do
    deleted=$(
      sql --set=cutoff="$cutoff" << 'SQL'
WITH deleted AS (
  DELETE FROM chat_log
  WHERE id IN (
    SELECT id FROM chat_log
    WHERE datetime_sent < :'cutoff'
    ORDER BY datetime_sent, id
    LIMIT 10000
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
    if ((batches % 100 == 0)); then
      echo "Deleted $total chat messages so far; vacuuming."
      sql --command="VACUUM chat_log"
    fi
  done
  if ((total > 0)); then
    sql --command="VACUUM (ANALYZE) chat_log"
  fi
  echo "Deleted $total chat messages older than one year."
}
delete_old_chat

PARTIAL_PATH=$(mktemp "$BACKUPS_DIR/.$FILENAME.XXXXXX.partial")

function compress_dump {
  if [[ -n $MAX_BACKUP_KB ]]; then
    # Bash uses KiB for this limit unless POSIXLY_CORRECT is set.
    unset POSIXLY_CORRECT || return
    ulimit -f "$MAX_BACKUP_KB" || return
  fi
  gzip -c
}

echo "Streaming a compressed database backup..."
if ! PGPASSWORD="$DB_PASSWORD" pg_dump --host="$DB_HOST" --port="$DB_PORT" --username="$DB_USER" --dbname="$DB_NAME" \
  | compress_dump > "$PARTIAL_PATH"; then
  fail "pg_dump or compression failed; the incomplete file was removed."
fi
gzip -t "$PARTIAL_PATH"
mv -- "$PARTIAL_PATH" "$BACKUPS_DIR/$FILENAME"
echo "Completed database backup: $FILENAME"

KEEP_LOCAL_BACKUPS=2 # Every backup is also uploaded to Google Drive.

# Delete all but the newest local backups. The names contain fixed-width epoch timestamps, so the
# glob lists them from oldest to newest. Incomplete backups are hidden and do not match.
function delete_old_local_backups {
  local backups=("$BACKUPS_DIR/$REPO_NAME-"*.sql.gz)
  local index
  for ((index = 0; index < ${#backups[@]} - KEEP_LOCAL_BACKUPS; index++)); do
    rm -- "${backups[index]}"
    echo "Deleted an old local backup: ${backups[index]}"
  done
}
delete_old_local_backups

# Only a few backups are kept locally, so a backup that is not uploaded is a failure.
if [[ -z ${GOOGLE_DRIVE_SERVICE_ACCOUNT_FILENAME-} || -z ${GOOGLE_DRIVE_PARENT_DIRECTORY_ID-} ]]; then
  fail "Google Drive is not configured: set GOOGLE_DRIVE_SERVICE_ACCOUNT_FILENAME and GOOGLE_DRIVE_PARENT_DIRECTORY_ID in .env."
fi
if ! command -v gdrive > /dev/null; then
  fail "The gdrive program is not on the PATH, so the backup was not uploaded."
fi

# Delete the oldest backups until the new one fits, plus a 100 MiB margin. Deleted sizes are added up
# from the listing because Drive may report the new free space late, which could delete extra files.
function make_room_on_gdrive {
  local free needed listing id size
  needed=$(($(stat -c %s "$BACKUPS_DIR/$FILENAME") + 104857600))
  free=$(gdrive about --bytes --service-account "$GOOGLE_DRIVE_SERVICE_ACCOUNT_FILENAME" | awk '$1 == "Free:" { print $2 }')
  if [[ ! $free =~ ^[0-9]+$ ]]; then
    fail "Failed to read the free space on Google Drive."
  fi
  echo "Google Drive has $free bytes free and needs $needed bytes."
  if ((free >= needed)); then
    return
  fi

  # We need to filter out directories, so we make sure to include the file extension.
  # https://developers.google.com/drive/api/guides/search-shareddrives
  listing=$(gdrive list --bytes --service-account "$GOOGLE_DRIVE_SERVICE_ACCOUNT_FILENAME" --no-header --max 9999 --order "createdTime" --query "trashed = false and 'me' in owners and name contains '$REPO_NAME' and name contains '.sql.gz'")
  while read -r id _ _ size _; do
    if [[ ! $size =~ ^[0-9]+$ ]]; then
      continue
    fi
    gdrive delete --service-account "$GOOGLE_DRIVE_SERVICE_ACCOUNT_FILENAME" "$id"
    free=$((free + size))
    echo "Deleted the oldest backup from Google Drive: $id"
    if ((free >= needed)); then
      return
    fi
  done <<< "$listing"
  fail "Deleting every old backup would not free enough space on Google Drive."
}
make_room_on_gdrive

# Upload the file to Google Drive.
gdrive upload "$BACKUPS_DIR/$FILENAME" --service-account "$GOOGLE_DRIVE_SERVICE_ACCOUNT_FILENAME" --parent "$GOOGLE_DRIVE_PARENT_DIRECTORY_ID"
