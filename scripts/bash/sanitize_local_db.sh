#!/bin/bash

# Get the directory of this script
# https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

# Import the database information
source "$DIR/../../.env"
if [[ -z $DB_HOST ]]; then
  DB_HOST=localhost
fi
if [[ -z $DB_PORT ]]; then
  DB_PORT=5432
fi
if [[ -z $DB_USER ]]; then
  echo "Error: You must specify the database username in the \".env\" file."
  exit 1
fi
if [[ -z $DB_PASS ]]; then
  echo "Error: You must specify the database password in the \".env\" file."
  exit 1
fi
if [[ -z $DB_NAME ]]; then
  echo "Error: You must specify the database name in the \".env\" file."
  exit 1
fi

PGPASSWORD="$DB_PASS" psql --host="$DB_HOST" --port="$DB_PORT" --username="$DB_USER" --dbname="$DB_NAME" << EOF
UPDATE users SET last_ip='0.0.0.0';
DELETE FROM user_settings;
DELETE FROM user_friends;
DELETE FROM user_reverse_friends;
DELETE FROM chat_log;
DELETE FROM chat_log_pm;
DELETE FROM banned_ips;
DELETE FROM muted_ips;
DELETE FROM throttled_ips;
DELETE FROM discord_waiters;
EOF
