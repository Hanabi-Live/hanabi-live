#!/bin/bash

USER="Zamiel"
SCORE="30"
VARIANT="12" # RB1oE
QUERY="SELECT * FROM games JOIN game_participants ON games.id = game_participants.id ;"
mysql -uroot -p$PASS hanabi <<EOF
SELECT games.id AS id, games.seed AS seed
FROM games
JOIN game_participants ON games.id = game_participants.game_id
JOIN users ON users.id = game_participants.user_id
WHERE games.score = $SCORE
AND games.variant = $VARIANT
AND users.username = "$USER"
;
EOF
