#!/bin/bash

# This is the directory that this script lives in
# From: https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

# Import the database username and password
source "$DIR/../.env"

mysql -u"$DB_USER" -p"$DB_PASS" < "$DIR/database_schema.sql"
