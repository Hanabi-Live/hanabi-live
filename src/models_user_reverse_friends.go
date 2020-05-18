package main

import (
	"context"
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
	rows, err := db.Query(context.Background(), `
		SELECT friend_id
		FROM user_reverse_friends
		WHERE user_id = $1
	`, userID)

	friendMap := make(map[int]struct{})
	for rows.Next() {
		var friendID int
		if err2 := rows.Scan(&friendID); err2 != nil {
			return friendMap, err2
		}
		friendMap[friendID] = struct{}{}
	}

	if rows.Err() != nil {
		return friendMap, err
	}
	rows.Close()

	return friendMap, nil
}
