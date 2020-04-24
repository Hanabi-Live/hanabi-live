#!/bin/bash

if [[ $# -ne 1 ]]; then
  echo "usage: `basename "$0"` [username] [password_hash]"
  exit 1
fi

# Import the database username and password
source ../.env

mysql -u$DB_USER -p$DB_PASS $DB_NAME "UPDATE users SET password='$2' WHERE username='$1';"
