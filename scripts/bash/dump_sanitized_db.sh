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
banned_ips
chat_log
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
