#!/bin/bash

# Get the directory of this script
# https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

# Import the database username and password
source "$DIR/.env"

# Open a database shell
mysql -u"$DB_USER" -p"$DB_PASS" hanabi
