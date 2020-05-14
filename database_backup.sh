#!/bin/bash

# Redirect all output to syslog
# https://www.urbanautomaton.com/blog/2014/09/09/redirecting-bash-script-output-to-syslog/
exec 1> >(logger -s -t $(basename $0)) 2>&1

# Get the directory of this script
# https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

# Get the name of the repository
# https://stackoverflow.com/questions/23162299/how-to-get-the-last-part-of-dirname-in-bash/23162553
REPO="$(basename "$DIR")"

# Configuration
BACKUPS_DIR="$DIR/backups"
FILENAME=$REPO-`date +%s`.sql # "date +%s" returns the epoch timestamp

# Import the database information
source "$DIR/.env"
if [[ -z $DB_HOST ]]; then
  DB_HOST=localhost
fi
if [[ -z $DB_PORT ]]; then
  DB_PORT=5432
fi

# Back up the database and gzip it
mkdir -p "$BACKUPS_DIR"
echo "Dumping the database..."
PGPASSWORD="$DB_PASS" pg_dump --host="$DB_HOST" --port="$DB_PORT" --username="$DB_USER" --dbname="$DB_NAME" > "$BACKUPS_DIR/$FILENAME"
if [[ $? -ne 0 ]]; then
  exit 1
fi
echo "Zipping the backup..."
gzip "$BACKUPS_DIR/$FILENAME"

# Delete old backups if the hard drive is getting full
# (but skip this if we are on Windows)
if uname -a | grep -v MINGW64 >/dev/null 2>&1; then
  AMOUNT_FULL=$(df "$DIR" | tail -1 | awk '{print $5}' | rev | cut -c 2- | rev)
  if [[ $AMOUNT_FULL -gt 80 ]]; then
    # Delete the oldest file in the backups directory
    echo "Hard drive over 80% full; deleting one of the older backups."
    rm "$(ls -t "$BACKUPS_DIR" | tail -1)"
  fi
fi

# Upload it to Google Drive
# Steps to install:
# 1) go get github.com/prasmussen/gdrive
# 2) mkdir ~/.gdrive
# 3) https://console.cloud.google.com/iam-admin/serviceaccounts?project=hanabi-live&folder=&organizationId=&supportedpurview=project
# 4) Actions --> Create key --> JSON --> Create
# 5) vim ~/.gdrive/hanabi-live-c3373cecaf32.json
# 6) Paste it in
# References: https://github.com/gdrive-org/gdrive/issues/533
if command -v gdrive > /dev/null; then
  if [[ ! -z $GOOGLE_DRIVE_SERVICE_ACCOUNT ]]; then
    gdrive upload "$BACKUPS_DIR/$FILENAME.gz" --service-account "$GOOGLE_DRIVE_SERVICE_ACCOUNT" --parent "$GOOGLE_DRIVE_PARENT_DIRECTORY"
  else
    echo "Skipping upload to Google Drive since \"GOOGLE_DRIVE_SERVICE_ACCOUNT\" is not set in the \".env\" file."
  fi
else
  echo "Skipping upload to Google Drive since the \"gdrive\" binary is not found."
fi
