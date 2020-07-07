#!/bin/bash

# Configuration
USER="Alice"
SCORE="25"
VARIANT="0"

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

mysql -u"$DB_USER" -p"$DB_PASS" "$DB_NAME" <<EOF
SELECT games.id AS id, games.seed AS seed
FROM games
JOIN game_participants ON games.id = game_participants.game_id
JOIN users ON users.id = game_participants.user_id
WHERE games.score = $SCORE
AND games.variant = "$VARIANT"
AND users.username = "$USER"
;
EOF
