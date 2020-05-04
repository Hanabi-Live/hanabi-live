package main

import (
	"context"
)

type GameParticipants struct{}

func (*GameParticipants) Insert(
	gameID int,
	userID int,
	seat int,
	characterAssignment int,
	characterMetadata int,
) error {
	_, err := db.Exec(
		context.Background(),
		`
			INSERT INTO game_participants (
				game_id,
				user_id,
				seat,
				character_assignment,
				character_metadata
			)
			VALUES (
				$1,
				$2,
				$3,
				$4,
				$5
			)
		`,
		gameID,
		userID,
		seat,
		characterAssignment,
		characterMetadata,
	)
	return err
}
