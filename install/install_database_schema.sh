#!/bin/bash

set -e # Exit on any errors

# This is the directory that this script lives in
# From: https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

# Import the database username and password
source "$DIR/../.env"

PGPASSWRD="$DB_PASS" pgql -U "$DB_USER" "$DB_NAME" < "$DIR/database_schema.sql"

echo "Successfully installed the database schema."
