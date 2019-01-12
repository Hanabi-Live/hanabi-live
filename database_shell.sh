#!/bin/bash

# Import the database username and password
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
source "$DIR/.env"

mysql -u$DB_USER -p$DB_PASS hanabi
