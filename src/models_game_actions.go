package main

import (
	"context"
)

type GameActions struct{}

// These fields are described in "database_schema.sql"
type GameAction struct {
	Type   int `json:"type"`
	Target int `json:"target"`
	Value  int `json:"value"`
}

func (*GameActions) Insert(gameID int, turn int, gameAction *GameAction) error {
	_, err := db.Exec(
		context.Background(),
		`
			INSERT INTO game_actions (
				game_id,
				turn,
				type,
				target,
				value
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
		turn,
		gameAction.Type,
		gameAction.Target,
		gameAction.Value,
	)
	return err
}

func (*GameActions) GetAll(databaseID int) ([]*GameAction, error) {
	rows, err := db.Query(context.Background(), `
		SELECT
			type,
			target,
			value
		FROM game_actions
		WHERE game_id = $1
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
	rows.Close()

	return actions, nil
}
