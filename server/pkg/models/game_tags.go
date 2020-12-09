package models

import (
	"context"

	"github.com/jackc/pgx/v4"
)

type GameTags struct {
	m *Models // Reverse reference
}

type GameTagsRow struct {
	GameID int
	UserID int
	Tag    string
}

func (gt *GameTags) Insert(ctx context.Context, gameID int, userID int, tag string) error {
	SQLString := `
		INSERT INTO game_tags (game_id, user_id, tag)
		VALUES ($1, $2, $3)
	`

	_, err := gt.m.db.Exec(ctx, SQLString, gameID, userID, tag)
	return err
}

func (gt *GameTags) BulkInsert(ctx context.Context, gameTagsRows []*GameTagsRow) error {
	SQLString := `
		INSERT INTO game_tags (game_id, user_id, tag)
		VALUES %s
	`
	numArgsPerRow := 3
	valueArgs := make([]interface{}, 0, numArgsPerRow*len(gameTagsRows))
	for _, gameTagsRow := range gameTagsRows {
		valueArgs = append(valueArgs, gameTagsRow.GameID, gameTagsRow.UserID, gameTagsRow.Tag)
	}
	SQLString = getBulkInsertSQLSimple(SQLString, numArgsPerRow, len(gameTagsRows))

	_, err := gt.m.db.Exec(ctx, SQLString, valueArgs...)
	return err
}

func (gt *GameTags) Delete(ctx context.Context, gameID int, tag string) error {
	SQLString := `
		DELETE FROM game_tags
		WHERE game_id = $1
			AND tag = $2
	`

	_, err := gt.m.db.Exec(ctx, SQLString, gameID, tag)
	return err
}

func (gt *GameTags) GetAll(ctx context.Context, gameID int) ([]string, error) {
	SQLString := `
		SELECT tag
		FROM game_tags
		WHERE game_id = $1
	`

	tags := make([]string, 0)
	var rows pgx.Rows
	if v, err := gt.m.db.Query(ctx, SQLString, gameID); err != nil {
		return tags, err
	} else {
		rows = v
	}

	for rows.Next() {
		var tag string
		if err := rows.Scan(&tag); err != nil {
			return tags, err
		}
		tags = append(tags, tag)
	}

	if err := rows.Err(); err != nil {
		return tags, err
	}
	rows.Close()

	return tags, nil
}

func (gt *GameTags) SearchByTag(ctx context.Context, tag string) ([]int, error) {
	SQLString := `
		SELECT game_id
		FROM game_tags
		WHERE tag = $1
	`

	gameIDs := make([]int, 0)
	var rows pgx.Rows
	if v, err := gt.m.db.Query(ctx, SQLString, tag); err != nil {
		return gameIDs, err
	} else {
		rows = v
	}

	for rows.Next() {
		var gameID int
		if err := rows.Scan(&gameID); err != nil {
			return gameIDs, err
		}
		gameIDs = append(gameIDs, gameID)
	}

	if err := rows.Err(); err != nil {
		return gameIDs, err
	}
	rows.Close()

	return gameIDs, nil
}

func (gt *GameTags) SearchByUserID(ctx context.Context, userID int) (map[int][]string, error) {
	SQLString := `
		SELECT game_id, tag
		FROM game_tags
		WHERE user_id = $1
	`

	gamesMap := make(map[int][]string)
	var rows pgx.Rows
	if v, err := gt.m.db.Query(ctx, SQLString, userID); err != nil {
		return gamesMap, err
	} else {
		rows = v
	}

	for rows.Next() {
		var gameID int
		var tag string
		if err := rows.Scan(&gameID, &tag); err != nil {
			return gamesMap, err
		}
		gamesMap[gameID] = append(gamesMap[gameID], tag)
	}

	if err := rows.Err(); err != nil {
		return gamesMap, err
	}
	rows.Close()

	return gamesMap, nil
}
