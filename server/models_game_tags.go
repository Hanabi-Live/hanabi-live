package main

import (
	"context"
)

type GameTags struct{}

func (*GameTags) Insert(gameID int, userID int, tag string) error {
	_, err := db.Exec(context.Background(), `
		INSERT INTO game_tags (game_id, user_id, tag)
		VALUES ($1, $2, $3)
	`, gameID, tag)
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
	rows, err := db.Query(context.Background(), `
		SELECT tag
		FROM game_tags
		WHERE game_id = $1
	`, gameID)

	tags := make([]string, 0)
	for rows.Next() {
		var tag string
		if err2 := rows.Scan(&tag); err2 != nil {
			return tags, err2
		}
		tags = append(tags, tag)
	}

	if rows.Err() != nil {
		return tags, err
	}
	rows.Close()

	return tags, nil
}

func (*GameTags) Search(tag string) ([]int, error) {
	rows, err := db.Query(context.Background(), `
		SELECT game_id
		FROM game_tags
		WHERE tag = $1
	`, tag)

	gameIDs := make([]int, 0)
	for rows.Next() {
		var gameID int
		if err2 := rows.Scan(&gameID); err2 != nil {
			return gameIDs, err2
		}
		gameIDs = append(gameIDs, gameID)
	}

	if rows.Err() != nil {
		return gameIDs, err
	}
	rows.Close()

	return gameIDs, nil
}
