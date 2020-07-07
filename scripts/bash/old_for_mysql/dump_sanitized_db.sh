#!/bin/bash

# Taken from:
# https://stackoverflow.com/questions/425158/skip-certain-tables-with-mysqldump

# Import the database username and password
source ../../.env

if [[ -z $DB_HOST ]]; then
  DB_HOST=localhost
fi
if [[ -z $DB_USER ]]; then
  echo "Error: You must specify the database username in the \".env\" file."
  exit 1
fi
if [[ -z $DB_PASS ]]; then
  echo "Error: You must specify the database password in the \".env\" file."
  exit 1
fi
if [[ -z $DB_NAME ]]; then
  echo "Error: You must specify the database name in the \".env\" file."
  exit 1
fi

DB_FILE=sanitized_dump.sql
EXCLUDED_TABLES=(
users
user_settings
user_stats
# games
# game_participants
game_participant_notes
# game_actions
variant_stats
chat_log
chat_log_pm
banned_ips
muted_ips
throttled_ips
discord_metadata
discord_waiters
)

IGNORED_TABLES_STRING=''
for TABLE in "${EXCLUDED_TABLES[@]}"
do :
  IGNORED_TABLES_STRING+=" --ignore-table=${DB_NAME}.${TABLE}"
done

echo "Dump structure"
mysqldump --host="$DB_HOST" --user="$DB_USER" --password="$DB_PASSWORD" --single-transaction --no-data --routines "$DB_NAME" > ${DB_FILE}

echo "Dump content"
mysqldump --host="$DB_HOST" --user="$DB_USER" --password="$DB_PASSWORD" "$DB_NAME" --no-create-info --skip-triggers ${IGNORED_TABLES_STRING} >> ${DB_FILE}
