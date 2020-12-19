package main

import (
	"context"

	"github.com/jackc/pgx/v4"
)

type GameTags struct{}

type GameTagsRow struct {
	GameID int
	UserID int
	Tag    string
}

func (*GameTags) Insert(gameID int, userID int, tag string) error {
	_, err := db.Exec(context.Background(), `
		INSERT INTO game_tags (game_id, user_id, tag)
		VALUES ($1, $2, $3)
	`, gameID, userID, tag)
	return err
}

func (*GameTags) BulkInsert(gameTagsRows []*GameTagsRow) error {
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

	_, err := db.Exec(context.Background(), SQLString, valueArgs...)
	return err
}

func (*GameTags) Delete(gameID int, tag string) error {
	_, err := db.Exec(context.Background(), `
		DELETE FROM game_tags
		WHERE game_id = $1
			AND tag = $2
	`, gameID, tag)
	return err
}

func (*GameTags) GetAll(gameID int) ([]string, error) {
	tags := make([]string, 0)

	var rows pgx.Rows
	if v, err := db.Query(context.Background(), `
		SELECT tag
		FROM game_tags
		WHERE game_id = $1
	`, gameID); err != nil {
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

func (*GameTags) SearchByTag(tag string) ([]int, error) {
	gameIDs := make([]int, 0)

	var rows pgx.Rows
	if v, err := db.Query(context.Background(), `
		SELECT game_id
		FROM game_tags
		WHERE tag = $1
	`, tag); err != nil {
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

func (*GameTags) SearchByUserID(userID int) (map[int][]string, error) {
	gamesMap := make(map[int][]string)

	var rows pgx.Rows
	if v, err := db.Query(context.Background(), `
		SELECT game_id, tag
		FROM game_tags
		WHERE user_id = $1
	`, userID); err != nil {
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
