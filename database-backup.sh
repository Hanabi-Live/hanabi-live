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
      --data "{\"content\":\"The database backup failed with exit code $status. Check the logs with: journalctl -t database-backup.sh\"}" \
      "https://discord.com/api/v10/channels/$DISCORD_CHANNEL_WEBSITE_DEVELOPMENT/messages" \
    || echo "Failed to report the backup failure to Discord." >&2
}

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

mkdir -p "$BACKUPS_DIR"
MAX_BACKUP_KB=""
if uname -a | grep -v MINGW64 > /dev/null 2>&1; then
  exec 9> "$BACKUPS_DIR/.backup.lock"
  if ! flock -n 9; then
    echo "Another database backup is already running." >&2
    exit 1
  fi
  AVAILABLE_KB=$(df -Pk "$BACKUPS_DIR" | awk 'NR == 2 { print $4 }')
  # Leave at least 1 GiB for PostgreSQL and application writes.
  MAX_BACKUP_KB=$((AVAILABLE_KB - 1048576))
  if ((MAX_BACKUP_KB <= 0)); then
    echo "Not enough disk space for a backup while preserving 1 GiB of free space." >&2
    exit 1
  fi
fi

PARTIAL_PATH=$(mktemp "$BACKUPS_DIR/.$FILENAME.XXXXXX.partial")
trap 'exit 130' INT
trap 'exit 143' TERM

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
  echo "Database backup failed; removing the incomplete compressed file." >&2
  exit 1
fi
gzip -t "$PARTIAL_PATH"
mv -- "$PARTIAL_PATH" "$BACKUPS_DIR/$FILENAME"
echo "Completed database backup: $FILENAME"

# Delete old backups if the hard drive is getting full (but skip this if we are on Windows).
function delete_file_if_near_full_local {
  local amount_full oldest_file file
  while true; do
    amount_full=$(df -Pk "$BACKUPS_DIR" | awk 'NR == 2 { sub(/%$/, "", $5); print $5 }')
    echo "Local hard drive amount full: $amount_full"
    if ((amount_full <= 75)); then
      return
    fi
    oldest_file=""
    for file in "$BACKUPS_DIR/$REPO_NAME-"*.sql.gz; do
      if [[ -f $file && $file != "$BACKUPS_DIR/$FILENAME" ]]; then
        if [[ -z $oldest_file || $file -ot $oldest_file ]]; then
          oldest_file=$file
        fi
      fi
    done
    if [[ -z $oldest_file ]]; then
      echo "No older backups remain to prune; keeping the newest completed backup." >&2
      return
    fi
    rm -- "$oldest_file"
    echo "Hard drive over 75% full; deleted the oldest backup: $oldest_file"
  done
}
if uname -a | grep -v MINGW64 > /dev/null 2>&1; then
  delete_file_if_near_full_local
fi

# Detect to see if we have Google Drive backups configured (see "install.md").
if [[ -z ${GOOGLE_DRIVE_SERVICE_ACCOUNT_FILENAME-} ]]; then
  echo "Skipping upload to Google Drive since \"GOOGLE_DRIVE_SERVICE_ACCOUNT_FILENAME\" is not set in the \".env\" file."
  exit 0
fi
if [[ -z ${GOOGLE_DRIVE_PARENT_DIRECTORY_ID-} ]]; then
  echo "Skipping upload to Google Drive since \"GOOGLE_DRIVE_PARENT_DIRECTORY_ID\" is not set in the \".env\" file."
  exit 0
fi
if command -v "gdrive" > /dev/null; then
  GDRIVE_PATH="gdrive"
else
  GDRIVE_ROOT_PATH="/root/go/bin/gdrive"
  if [[ -f $GDRIVE_ROOT_PATH ]]; then
    GDRIVE_PATH=$GDRIVE_ROOT_PATH
  fi
fi
if [[ -z ${GDRIVE_PATH-} ]]; then
  echo "Skipping upload to Google Drive since the \"gdrive\" binary is not found."
  exit 1
fi

# Delete the oldest backups until the new one fits, plus a 100 MiB margin. Deleted sizes are added up
# from the listing because Drive may report the new free space late, which could delete extra files.
function make_room_on_gdrive {
  local free needed listing id size
  needed=$(($(stat -c %s "$BACKUPS_DIR/$FILENAME") + 104857600))
  free=$($GDRIVE_PATH about --bytes --service-account "$GOOGLE_DRIVE_SERVICE_ACCOUNT_FILENAME" | awk '$1 == "Free:" { print $2 }')
  if [[ ! $free =~ ^[0-9]+$ ]]; then
    echo "Failed to read the free space on Google Drive." >&2
    return 1
  fi
  echo "Google Drive has $free bytes free and needs $needed bytes."
  if ((free >= needed)); then
    return
  fi

  # We need to filter out directories, so we make sure to include the file extension.
  # https://developers.google.com/drive/api/guides/search-shareddrives
  listing=$($GDRIVE_PATH list --bytes --service-account "$GOOGLE_DRIVE_SERVICE_ACCOUNT_FILENAME" --no-header --max 9999 --order "createdTime" --query "trashed = false and 'me' in owners and name contains '$REPO_NAME' and name contains '.sql.gz'")
  while read -r id _ _ size _; do
    if [[ ! $size =~ ^[0-9]+$ ]]; then
      continue
    fi
    $GDRIVE_PATH delete --service-account "$GOOGLE_DRIVE_SERVICE_ACCOUNT_FILENAME" "$id"
    free=$((free + size))
    echo "Deleted the oldest backup from Google Drive: $id"
    if ((free >= needed)); then
      return
    fi
  done <<< "$listing"
  echo "Deleting every old backup would not free enough space on Google Drive." >&2
  return 1
}
make_room_on_gdrive

# Upload the file to Google Drive.
$GDRIVE_PATH upload "$BACKUPS_DIR/$FILENAME" --service-account "$GOOGLE_DRIVE_SERVICE_ACCOUNT_FILENAME" --parent "$GOOGLE_DRIVE_PARENT_DIRECTORY_ID"
