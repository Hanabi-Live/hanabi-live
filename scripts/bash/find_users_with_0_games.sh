#!/bin/bash

# Import the database username and password
source ../../.env

mysql -u"$DB_USER" -p"$DB_PASS" "$DB_NAME" <<EOF
SELECT users.id, users.username, (
	SELECT COUNT(game_participants.id)
	FROM game_participants
	WHERE game_participants.user_ID = users.id
) AS num_games
FROM users
HAVING num_games = 0
;
EOF
