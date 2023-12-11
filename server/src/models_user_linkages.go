package main

import (
	"context"
	"github.com/jackc/pgx/v4"
)

type UserLinkages struct{}

func (*UserLinkages) Insert(userID int, linkedID int) error {
	_, err := db.Exec(context.Background(), `
			INSERT INTO user_linkages (user_id, linked_id)
			VALUES ($1, $2)
	`, userID, linkedID)
	return err
}

func (*UserLinkages) Delete(userID int, linkedID int) error {
	_, err := db.Exec(context.Background(), `
		DELETE FROM user_linkages
		WHERE user_id = $1
			AND linked_id = $2
	`, userID, linkedID)
	return err
}

func (*UserLinkages) GetAllUsernames(userID int) ([]string, error) {
	linkedUsers := make([]string, 0)

	var rows pgx.Rows
	if v, err := db.Query(context.Background(), `
		SELECT users.username
		FROM user_linkages
			JOIN users ON user_linkages.linked_id = users.id
		WHERE user_linkages.user_id = $1
	`, userID); err != nil {
		return linkedUsers, err
	} else {
		rows = v
	}

	for rows.Next() {
		var linked_user string
		if err := rows.Scan(&linked_user); err != nil {
			return linkedUsers, err
		}
		linkedUsers = append(linkedUsers, linked_user)
	}
	linkedUsers = sortStringsCaseInsensitive(linkedUsers)

	if err := rows.Err(); err != nil {
		return linkedUsers, err
	}
	rows.Close()

	return linkedUsers, nil
}

// GetMap composes a map that represents all of this user's friends
// We use a map to represent the friends instead of a slice because it is faster to check for the
// existence of a friend in a map than to iterate through a slice
func (*UserLinkages) GetMap(userID int) (map[int]struct{}, error) {
	linkedMap := make(map[int]struct{})

	var rows pgx.Rows
	if v, err := db.Query(context.Background(), `
		SELECT linked_id
		FROM user_linkages
		WHERE user_id = $1
	`, userID); err != nil {
		return linkedMap, err
	} else {
		rows = v
	}

	for rows.Next() {
		var linkedID int
		if err := rows.Scan(&linkedID); err != nil {
			return linkedMap, err
		}
		linkedMap[linkedID] = struct{}{}
	}

	if err := rows.Err(); err != nil {
		return linkedMap, err
	}
	rows.Close()

	return linkedMap, nil
}
