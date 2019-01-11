#!/bin/bash

# Configuration
GAME_ID="17232"

# Import the database username and password
source ../.env

mysql -u$DB_USER -p$DB_PASS $DB_NAME <<EOF
SELECT games.id, games.name
FROM games
JOIN game_participants ON games.id = game_participants.game_id
JOIN users ON users.id = game_participants.user_id
WHERE games.id = $GAME_ID
;
EOF
