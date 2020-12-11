package models

import (
	"context"

	"github.com/Zamiell/hanabi-live/server/pkg/options"
	"github.com/jackc/pgx/v4"
)

type GameActions struct {
	m *Models // Reverse reference
}

// GameActionRow mirrors the "game_actions" database table row.
type GameActionRow struct {
	GameID int
	Turn   int
	Type   int
	Target int
	Value  int
}

func (ga *GameActions) BulkInsert(ctx context.Context, gameActionRows []*GameActionRow) error {
	SQLString := `
		INSERT INTO game_actions (
			game_id,
			turn,
			type,
			target,
			value
		)
		VALUES %s
	`
	numArgsPerRow := 5
	valueArgs := make([]interface{}, 0, numArgsPerRow*len(gameActionRows))
	for _, gameActionRow := range gameActionRows {
		valueArgs = append(
			valueArgs,
			gameActionRow.GameID,
			gameActionRow.Turn,
			gameActionRow.Type,
			gameActionRow.Target,
			gameActionRow.Value,
		)
	}
	SQLString = getBulkInsertSQLSimple(SQLString, numArgsPerRow, len(gameActionRows))

	_, err := ga.m.db.Exec(ctx, SQLString, valueArgs...)
	return err
}

func (ga *GameActions) GetAll(ctx context.Context, databaseID int) ([]*options.GameAction, error) {
	SQLString := `
		SELECT
			type,
			target,
			value
		FROM game_actions
		WHERE game_id = $1
		ORDER BY turn
	`

	actions := make([]*options.GameAction, 0)
	var rows pgx.Rows
	if v, err := ga.m.db.Query(ctx, SQLString, databaseID); err != nil {
		return actions, err
	} else {
		rows = v
	}

	// Iterate over all of the actions and add them to a slice
	for rows.Next() {
		var action options.GameAction
		if err := rows.Scan(
			&action.Type,
			&action.Target,
			&action.Value,
		); err != nil {
			return actions, err
		}

		actions = append(actions, &action)
	}

	if err := rows.Err(); err != nil {
		return actions, err
	}
	rows.Close()

	return actions, nil
}
