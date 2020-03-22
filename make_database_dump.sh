#!/bin/bash

# Get the directory of this script
# https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

# Get the name of the repository
# https://stackoverflow.com/questions/23162299/how-to-get-the-last-part-of-dirname-in-bash/23162553
REPO="$(basename "$DIR")"

# Configuration
BACKUPS_DIR="$DIR/backups"
FILENAME=$REPO-`date +%s`.sql # "date +%s" returns the epoch timestamp

# Import the database username and password
source "$DIR/.env"

# Back up the database and gzip it
mkdir -p "$BACKUPS_DIR"
echo Dumping the database...
mysqldump -u"$DB_USER" -p"$DB_PASS" "$DB_NAME" > "$BACKUPS_DIR/$FILENAME"
echo Zipping the backup...
gzip "$BACKUPS_DIR/$FILENAME"
echo Complete.

# Delete old backups if the hard drive is getting full
AMOUNT_FULL=$(df "$DIR" | tail -1 | awk '{print $5}' | rev | cut -c 2- | rev)
if [ $AMOUNT_FULL -gt 80 ]; then
    # Delete the oldest file in the backups directory
    rm "$(ls -t "$BACKUPS_DIR" | tail -1)"
fi
