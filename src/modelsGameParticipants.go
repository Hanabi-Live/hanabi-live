package main

import (
	"database/sql"
)

type GameParticipants struct{}

func (*GameParticipants) Insert(
	gameID int,
	userID int,
	seat int,
	characterAssignment int,
	characterMetadata int,
) error {
	var stmt *sql.Stmt
	if v, err := db.Prepare(`
		INSERT INTO game_participants (
			game_id,
			user_id,
			seat,
			character_assignment,
			character_metadata
		)
		VALUES (
			?,
			?,
			?,
			?,
			?
		)
	`); err != nil {
		return err
	} else {
		stmt = v
	}
	defer stmt.Close()

	_, err := stmt.Exec(
		gameID,
		userID,
		seat,
		characterAssignment,
		characterMetadata,
	)
	return err
}
