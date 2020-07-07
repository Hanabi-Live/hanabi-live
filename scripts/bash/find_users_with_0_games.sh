#!/bin/bash

# Import the database username and password
source ../../.env

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

PGPASSWORD="$DB_PASS" psql --host="$DB_HOST" --port="$DB_PORT" --username="$DB_USER" --dbname="$DB_NAME" <<EOF
SELECT users.id, users.username, (
  SELECT COUNT(game_participants.game_id)
  FROM game_participants
  WHERE game_participants.user_ID = users.id
) AS num_games
FROM users
HAVING num_games = 0
;
EOF
