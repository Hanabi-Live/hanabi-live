package main

import (
	"context"
)

type GameParticipantNotes struct{}

func (*GameParticipantNotes) Insert(userID int, gameID int, order int, note string) error {
	_, err := db.Exec(
		context.Background(),
		`
			INSERT INTO game_participant_notes (
				game_participant_id,
				card_order,
				note
			)
			VALUES (
				(SELECT id FROM game_participants WHERE user_id = $1 AND game_id = $2),
				$3,
				$4
			)
		`,
		userID,
		gameID,
		order,
		note,
	)
	return err
}
