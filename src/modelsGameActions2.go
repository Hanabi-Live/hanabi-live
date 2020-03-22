package main

import (
	"database/sql"
)

type GameActions2 struct{}

type GameAction struct {
	Type      int
	Target    int
	ClueGiver int
	ClueType  int
	ClueValue int
}

func (*GameActions2) Insert(databaseID, turn, gameAction GameAction) error {
	var stmt *sql.Stmt
	if v, err := db.Prepare(`
		INSERT INTO game_actions2 (
			game_id,
			turn,
			type,
			target,
			clue_giver,
			clue_type,
			clue_value
		)
		VALUES (
			?,
			?,
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
		databaseID,
		turn,
		gameAction.Type,
		gameAction.Target,
		gameAction.ClueGiver,
		gameAction.ClueType,
		gameAction.ClueValue,
	)
	return err
}

func (*GameActions2) GetAll(databaseID int) ([]GameAction, error) {
	rows, err := db.Query(`
		SELECT
			type,
			target,
			clue_giver,
			clue_type,
			clue_value
		FROM game_actions2
		WHERE game_id = ?
		ORDER BY turn
	`, databaseID)

	// Iterate over all of the actions and add them to a slice
	actions := make([]GameAction, 0)
	for rows.Next() {
		var action GameAction
		if err := rows.Scan(
			&action.Type,
			&action.Target,
			&action.ClueGiver,
			&action.ClueType,
			&action.ClueValue,
		); err != nil {
			return nil, err
		}

		actions = append(actions, action)
	}

	if rows.Err() != nil {
		return nil, err
	}
	if err := rows.Close(); err != nil {
		return nil, err
	}

	return actions, nil
}
