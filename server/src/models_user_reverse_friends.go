package main

import (
	"context"

	"github.com/jackc/pgx/v4"
)

type UserReverseFriends struct{}

func (*UserReverseFriends) Insert(userID int, friendID int) error {
	_, err := db.Exec(context.Background(), `
		INSERT INTO user_reverse_friends (user_id, friend_id)
		VALUES ($1, $2)
	`, userID, friendID)
	return err
}

func (*UserReverseFriends) Delete(userID int, friendID int) error {
	_, err := db.Exec(context.Background(), `
		DELETE FROM user_reverse_friends
		WHERE user_id = $1
			AND friend_id = $2
	`, userID, friendID)
	return err
}

func (*UserReverseFriends) GetMap(userID int) (map[int]struct{}, error) {
	friendMap := make(map[int]struct{})

	var rows pgx.Rows
	if v, err := db.Query(context.Background(), `
		SELECT friend_id
		FROM user_reverse_friends
		WHERE user_id = $1
	`, userID); err != nil {
		return friendMap, err
	} else {
		rows = v
	}

	for rows.Next() {
		var friendID int
		if err := rows.Scan(&friendID); err != nil {
			return friendMap, err
		}
		friendMap[friendID] = struct{}{}
	}

	if err := rows.Err(); err != nil {
		return friendMap, err
	}
	rows.Close()

	return friendMap, nil
}
