#!/bin/bash

# This is the directory that this script lives in
# From: https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

# Import the database username and password
source "$DIR/../.env"

if id "postgres" >/dev/null 2>&1; then
  # Linux
  sudo -u postgres psql "$DB_NAME" < "$DIR/database_schema.sql"
else
  # Windows & MacOS
  PGPASSWORD="$DB_PASS" psql -U "$DB_USER" "$DB_NAME" < "$DIR/database_schema.sql"
fi

echo "Successfully installed the database schema."
