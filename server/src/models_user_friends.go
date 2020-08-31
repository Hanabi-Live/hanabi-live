package main

import (
	"context"

	"github.com/jackc/pgx/v4"
)

type UserFriends struct{}

func (*UserFriends) Insert(userID int, friendID int) error {
	_, err := db.Exec(context.Background(), `
		INSERT INTO user_friends (user_id, friend_id)
		VALUES ($1, $2)
	`, userID, friendID)
	return err
}

func (*UserFriends) Delete(userID int, friendID int) error {
	_, err := db.Exec(context.Background(), `
		DELETE FROM user_friends
		WHERE user_id = $1
			AND friend_id = $2
	`, userID, friendID)
	return err
}

func (*UserFriends) GetAllUsernames(userID int) ([]string, error) {
	friends := make([]string, 0)

	var rows pgx.Rows
	if v, err := db.Query(context.Background(), `
		SELECT users.username
		FROM user_friends
			JOIN users ON user_friends.friend_id = users.id
		WHERE user_friends.user_id = $1
	`, userID); err != nil {
		return friends, err
	} else {
		rows = v
	}

	for rows.Next() {
		var friend string
		if err := rows.Scan(&friend); err != nil {
			return friends, err
		}
		friends = append(friends, friend)
	}
	friends = sortStringsCaseInsensitive(friends)

	if err := rows.Err(); err != nil {
		return friends, err
	}
	rows.Close()

	return friends, nil
}

// GetMap composes a map that represents all of this user's friends
// We use a map to represent the friends instead of a slice because it is faster to check for the
// existence of a friend in a map than to interate through a slice
func (*UserFriends) GetMap(userID int) (map[int]struct{}, error) {
	friendMap := make(map[int]struct{})

	var rows pgx.Rows
	if v, err := db.Query(context.Background(), `
		SELECT friend_id
		FROM user_friends
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
