package models

import (
	"database/sql"
	"encoding/json"
)

type GameParticipants struct{}

func (*GameParticipants) Insert(userID int, gameID int, notes []string) error {
	var notesString string
	if v, err := json.Marshal(notes); err != nil {
		return err
	} else {
		notesString = string(v)
	}

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

	if _, err := stmt.Exec(userID, gameID, notesString); err != nil {
		return err
	}

	return nil
}
