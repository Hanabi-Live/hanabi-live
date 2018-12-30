#!/bin/bash

# Configuration
REPO_DIR=/root/go/src/github.com/Zamiell/hanabi-live
FILENAME=hanabi-live-`date +%s`.sql # "date +%s" returns the epoch timestamp

# Import the database username and password
source $REPO_DIR/.env

# Back up the database and gzip it
mkdir -p $REPO_DIR/backups
mysqldump -u$DB_USER -p$DB_PASS hanabi > $REPO_DIR/backups/$FILENAME
gzip $REPO_DIR/backups/$FILENAME
