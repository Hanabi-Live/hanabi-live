#!/bin/bash

# This is the directory that this script lives in
# From: https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

# Import the database information
source "$DIR/../.env"
if [[ -z $DB_HOST ]]; then
  DB_HOST=localhost
fi
if [[ -z $DB_PORT ]]; then
  DB_PORT=5432
fi

PGPASSWORD="$DB_PASS" psql \
  --quiet \
  --variable=ON_ERROR_STOP=1 \
  --host="$DB_HOST" \
  --port="$DB_PORT" \
  --username="$DB_USER" \
  --dbname="$DB_NAME" \
  < "$DIR/database_schema.sql"

if [[ $? -eq 0 ]]; then
  echo "Successfully installed the database schema."
fi
