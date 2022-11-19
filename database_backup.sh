#!/bin/bash

# Redirect all output to syslog (but skip this if we are on Windows).
# https://www.urbanautomaton.com/blog/2014/09/09/redirecting-bash-script-output-to-syslog/
if uname -a | grep -v MINGW64 >/dev/null 2>&1; then
  exec 1> >(logger -s -t $(basename $0)) 2>&1
fi

# Get the directory of this script:
# https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

# Get the name of the repository:
# https://stackoverflow.com/questions/23162299/how-to-get-the-last-part-of-dirname-in-bash/23162553
REPO="$(basename "$DIR")"

# Configuration
BACKUPS_DIR="$DIR/backups"
FILENAME=$REPO-`date +%s`.sql # "date +%s" returns the epoch timestamp.

# Import the database information.
ENV_PATH="$DIR/.env"
if [[ ! -f $ENV_PATH ]]; then
  echo "Failed to find the \".env\" file at: $ENV_PATH"
  exit 1
fi
source "$ENV_PATH"
if [[ -z $DB_HOST ]]; then
  DB_HOST=localhost
fi
if [[ -z $DB_PORT ]]; then
  DB_PORT=5432
fi

# Back up the database and gzip it.
mkdir -p "$BACKUPS_DIR"
echo "Dumping the database..."
PGPASSWORD="$DB_PASS" pg_dump --host="$DB_HOST" --port="$DB_PORT" --username="$DB_USER" --dbname="$DB_NAME" > "$BACKUPS_DIR/$FILENAME"
if [[ $? -ne 0 ]]; then
  exit 1
fi
echo "Zipping the backup..."
gzip "$BACKUPS_DIR/$FILENAME"

# Delete old backups if the hard drive is getting full (but skip this if we are
# on Windows).
function delete_file_if_near_full_local {
  AMOUNT_FULL=$(df "$DIR" | tail -1 | awk '{print $5}' | rev | cut -c 2- | rev)
  echo "Local hard drive amount full: $AMOUNT_FULL"
  if [[ $AMOUNT_FULL -gt 80 ]]; then
    # Delete the oldest file in the backups directory.
    echo "Hard drive over 80% full; deleting the oldest backup."
    rm "$(ls -t "$BACKUPS_DIR" | tail -1)"
    delete_file_if_near_full_local
  fi
}
if uname -a | grep -v MINGW64 >/dev/null 2>&1; then
  delete_file_if_near_full_local
fi

# Detect to see if we have Google Drive backups configured (see "INSTALL.md").
if [[ -z $GOOGLE_DRIVE_SERVICE_ACCOUNT_FILENAME ]]; then
  echo "Skipping upload to Google Drive since \"GOOGLE_DRIVE_SERVICE_ACCOUNT_FILENAME\" is not set in the \".env\" file."
  exit 0
fi
if [[ -z $GOOGLE_DRIVE_PARENT_DIRECTORY_ID ]]; then
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
if [[ -z $GDRIVE_PATH ]]; then
  echo "Skipping upload to Google Drive since the \"gdrive\" binary is not found."
  exit 1
fi

# Check for free space; if we have less than a gig left, then start deleting
# old files until we have at least a gig of storage left.
function delete_file_if_near_full_gdrive {
  AMOUNT_FULL=$($GDRIVE_PATH about --service-account "$GOOGLE_DRIVE_SERVICE_ACCOUNT_FILENAME" | grep Free)
  echo "GDrive amount full: $AMOUNT_FULL"
  if [[ $($AMOUNT_FULL | grep GB) ]]; then
    return
  fi
  echo "Google Drive account has under 1 gig of free space left; deleting the oldest backup."
  OLDEST_FILE_ID=$($GDRIVE_PATH list --service-account "$GOOGLE_DRIVE_SERVICE_ACCOUNT_FILENAME" --no-header --max 9999 --order "createdTime" --query "trashed = false and 'me' in owners and name contains '$REPO'" | head -n 1 | cut -f 1 -d " ")
  $GDRIVE_PATH delete --service-account "$GOOGLE_DRIVE_SERVICE_ACCOUNT_FILENAME" "$OLDEST_FILE_ID"
  delete_file_if_near_full_gdrive
}
delete_file_if_near_full_gdrive

# Upload the file to Google Drive.
$GDRIVE_PATH upload "$BACKUPS_DIR/$FILENAME.gz" --service-account "$GOOGLE_DRIVE_SERVICE_ACCOUNT_FILENAME" --parent "$GOOGLE_DRIVE_PARENT_DIRECTORY_ID"
