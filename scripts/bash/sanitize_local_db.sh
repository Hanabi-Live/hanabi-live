#!/bin/bash

set -euo pipefail # Exit on errors and undefined variables.

# Get the directory of this script:
# https://stackoverflow.com/questions/59895/getting-the-source-directory-of-a-bash-script-from-within
DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)

# Import the database information.
# shellcheck source=/dev/null
source "$DIR/../../.env"
if [[ -z ${DB_HOST-} ]]; then
  DB_HOST=localhost
fi
if [[ -z ${DB_PORT-} ]]; then
  DB_PORT=5432
fi
if [[ -z ${DB_USER-} ]]; then
  echo "Error: You must specify the database username in the \".env\" file."
  exit 1
fi
if [[ -z ${DB_PASSWORD-} ]]; then
  echo "Error: You must specify the database password in the \".env\" file."
  exit 1
fi
if [[ -z ${DB_NAME-} ]]; then
  echo "Error: You must specify the database name in the \".env\" file."
  exit 1
fi

# Tables not deleted:
# - users
# - games
# - game_participants
# - game_actions
# - seeds

PGPASSWORD="$DB_PASSWORD" psql --host="$DB_HOST" --port="$DB_PORT" --username="$DB_USER" --dbname="$DB_NAME" << EOF
UPDATE users SET last_ip='0.0.0.0';
DELETE FROM user_settings;
DELETE FROM user_stats;
DELETE FROM user_friends;
DELETE FROM user_reverse_friends;
DELETE FROM game_participant_notes;
DELETE FROM game_tags;
DELETE FROM variant_stats;
DELETE FROM chat_log;
DELETE FROM chat_log_pm;
DELETE FROM banned_ips;
DELETE FROM muted_ips;
UPDATE users SET username = CONCAT('anon_user_', id);
UPDATE users SET password_hash = '';
UPDATE users SET old_password_hash = '';
UPDATE users SET last_ip = '';
UPDATE users SET datetime_created = NOW();
UPDATE users SET datetime_last_login = NOW();
EOF
