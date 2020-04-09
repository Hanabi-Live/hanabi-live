package main

import (
	"database/sql"
)

type GameActions struct{}

// These fields are described in "database_schema.sql"
type GameAction struct {
	Type   int `json:"type"`
	Target int `json:"target"`
	Value  int `json:"value"`
}

func (*GameActions) Insert(gameID int, turn int, gameAction *GameAction) error {
	var stmt *sql.Stmt
	if v, err := db.Prepare(`
		INSERT INTO game_actions (
			game_id,
			turn,
			type,
			target,
			value
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
		turn,
		gameAction.Type,
		gameAction.Target,
		gameAction.Value,
	)
	return err
}

func (*GameActions) GetAll(databaseID int) ([]*GameAction, error) {
	rows, err := db.Query(`
		SELECT
			type,
			target,
			value
		FROM game_actions
		WHERE game_id = ?
		ORDER BY turn
	`, databaseID)

	// Iterate over all of the actions and add them to a slice
	actions := make([]*GameAction, 0)
	for rows.Next() {
		var action GameAction
		if err2 := rows.Scan(
			&action.Type,
			&action.Target,
			&action.Value,
		); err2 != nil {
			return nil, err2
		}

		actions = append(actions, &action)
	}

	if rows.Err() != nil {
		return nil, err
	}
	if err := rows.Close(); err != nil {
		return nil, err
	}

	return actions, nil
}
