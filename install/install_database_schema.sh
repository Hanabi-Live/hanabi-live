#!/bin/bash

# This is the directory that this script lives in
# From: https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

# Import the database username and password
source "$DIR/../.env"

if id "postgres" >/dev/null 2>&1; then
  # Linux (does not use a password)
  sudo -u postgres psql --quiet --variable=ON_ERROR_STOP=1 "$DB_NAME" < "$DIR/database_schema.sql"
else
  # Windows & MacOS (uses a password)
  PGPASSWORD="$DB_PASS" psql --quiet --variable=ON_ERROR_STOP=1 --username="$DB_USER" "$DB_NAME" < "$DIR/database_schema.sql"
fi

if [[ $? -eq 0 ]]; then
  echo "Successfully installed the database schema."
fi
