#!/bin/bash

# Taken from:
# https://stackoverflow.com/questions/425158/skip-certain-tables-with-mysqldump

# Import the database username and password
source ../../.env

PASSWORD=$DB_PASS
HOST=127.0.0.1
USER=$DB_USER
DATABASE=hanabi
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
  IGNORED_TABLES_STRING+=" --ignore-table=${DATABASE}.${TABLE}"
done

echo "Dump structure"
mysqldump --host=${HOST} --user=${USER} --password=${PASSWORD} --single-transaction --no-data --routines ${DATABASE} > ${DB_FILE}

echo "Dump content"
mysqldump --host=${HOST} --user=${USER} --password=${PASSWORD} ${DATABASE} --no-create-info --skip-triggers ${IGNORED_TABLES_STRING} >> ${DB_FILE}
