#!/bin/bash

# Get the directory of this script
# https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

# Configuration
BACKUPS_DIR="$DIR/backups"
FILENAME=hanabi-live-`date +%s`.sql # "date +%s" returns the epoch timestamp

# Import the database username and password
source "$DIR/.env"

# Back up the database and gzip it
mkdir -p "$BACKUPS_DIR"
mysqldump -u"$DB_USER" -p"$DB_PASS" "$DB_NAME" > "$BACKUPS_DIR/$FILENAME"
gzip "$BACKUPS_DIR/$FILENAME"

# Delete old backups if the hard drive is getting full
AMOUNT_FULL=$(df "$DIR" | tail -1 | awk '{print $5}' | rev | cut -c 2- | rev)
if [ $AMOUNT_FULL -gt 80 ]; then
    # Delete the oldest file in the backups directory
    rm "$(ls -t "$BACKUPS_DIR" | tail -1)"
fi
