package main

import (
	"context"
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

func (*UserFriends) GetAll(userID int) ([]string, error) {
	rows, err := db.Query(context.Background(), `
		SELECT users.username
		FROM user_friends
			JOIN users ON user_friends.friend_id = users.id
		WHERE user_friends.user_id = $1
	`, userID)

	friends := make([]string, 0)
	for rows.Next() {
		var friend string
		if err2 := rows.Scan(&friend); err2 != nil {
			return friends, err2
		}
		friends = append(friends, friend)
	}

	if rows.Err() != nil {
		return friends, err
	}
	rows.Close()

	return friends, nil
}

func (*UserFriends) GetAllIDs(userID int) ([]int, error) {
	rows, err := db.Query(context.Background(), `
		SELECT friend_id
		FROM user_friends
		WHERE user_id = $1
	`, userID)

	friendIDs := make([]int, 0)
	for rows.Next() {
		var friendID int
		if err2 := rows.Scan(&friendID); err2 != nil {
			return friendIDs, err2
		}
		friendIDs = append(friendIDs, friendID)
	}

	if rows.Err() != nil {
		return friendIDs, err
	}
	rows.Close()

	return friendIDs, nil
}
