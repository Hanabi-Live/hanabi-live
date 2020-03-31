package main

import (
	"database/sql"
)

type GameParticipantNotes struct{}

func (*GameParticipantNotes) Insert(userID int, gameID int, order int, note string) error {
	var stmt *sql.Stmt
	if v, err := db.Prepare(`
		INSERT INTO game_participant_notes (
			game_participant_id,
			card_order,
			note
		)
		VALUES (
			(SELECT id FROM game_participants WHERE user_id = ? AND game_id = ?),
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
		userID,
		gameID,
		order,
		note,
	)
	return err
}
