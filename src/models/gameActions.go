package models

import (
	"database/sql"
)

type GameActions struct{}

func (*GameActions) Insert(gameID int, action string) error {
	var stmt *sql.Stmt
	if v, err := db.Prepare(`
		INSERT INTO game_actions (game_id, action)
		VALUES (?, ?)
	`); err != nil {
		return err
	} else {
		stmt = v
	}
	defer stmt.Close()

	_, err := stmt.Exec(gameID, action)
	return err
}

func (*GameActions) GetAll(databaseID int) ([]string, error) {
	var rows *sql.Rows
	if v, err := db.Query(`
		SELECT action
		FROM game_actions
		WHERE game_id = ?
		ORDER BY id
	`, databaseID); err != nil {
		return nil, err
	} else {
		rows = v
	}
	defer rows.Close()

	// Iterate over all of the actions and add them to a slice
	actions := make([]string, 0)
	for rows.Next() {
		var action string
		if err := rows.Scan(&action); err != nil {
			return nil, err
		}

		actions = append(actions, action)
	}

	return actions, nil
}
