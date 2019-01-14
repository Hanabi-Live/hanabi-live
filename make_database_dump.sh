#!/bin/bash

# Get the directory of this script
# https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

# Configuration
FILENAME=hanabi-live-`date +%s`.sql # "date +%s" returns the epoch timestamp

# Import the database username and password
source "$DIR/.env"

# Back up the database and gzip it
mkdir -p "$DIR/backups"
mysqldump -u"$DB_USER" -p"$DB_PASS" hanabi > "$DIR/backups/$FILENAME"
gzip "$DIR/backups/$FILENAME"
