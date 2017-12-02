package models

import (
	"database/sql"
)

type GameParticipants struct{}

func (*GameParticipants) Insert(userID int, gameID int, notes string) error {
	var stmt *sql.Stmt
	if v, err := db.Prepare(`
		INSERT INTO game_participants (user_id, game_id, notes)
		VALUES (?, ?, ?)
	`); err != nil {
		return err
	} else {
		stmt = v
	}
	defer stmt.Close()

	if _, err := stmt.Exec(userID, gameID, notes); err != nil {
		return err
	}

	return nil
}
