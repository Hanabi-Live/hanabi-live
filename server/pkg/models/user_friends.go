package models

import (
	"context"

	"github.com/Zamiell/hanabi-live/server/pkg/util"
	"github.com/jackc/pgx/v4"
)

type UserFriends struct {
	m *Models // Reverse reference
}

func (uf *UserFriends) Insert(ctx context.Context, userID int, friendID int) error {
	SQLString := `
		INSERT INTO user_friends (user_id, friend_id)
		VALUES ($1, $2)
	`

	_, err := uf.m.db.Exec(ctx, SQLString, userID, friendID)
	return err
}

func (uf *UserFriends) Delete(ctx context.Context, userID int, friendID int) error {
	SQLString := `
		DELETE FROM user_friends
		WHERE user_id = $1
			AND friend_id = $2
	`

	_, err := uf.m.db.Exec(ctx, SQLString, userID, friendID)
	return err
}

func (uf *UserFriends) GetAllUsernames(ctx context.Context, userID int) ([]string, error) {
	SQLString := `
		SELECT users.username
		FROM user_friends
			JOIN users ON user_friends.friend_id = users.id
		WHERE user_friends.user_id = $1
	`

	friends := make([]string, 0)
	var rows pgx.Rows
	if v, err := uf.m.db.Query(ctx, SQLString, userID); err != nil {
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
	friends = util.SortStringsCaseInsensitive(friends)

	if err := rows.Err(); err != nil {
		return friends, err
	}
	rows.Close()

	return friends, nil
}

// GetMap composes a map that represents all of this user's friends
// We use a map to represent the friends instead of a slice because it is faster to check for the
// existence of a friend in a map than to interate through a slice
func (uf *UserFriends) GetMap(ctx context.Context, userID int) (map[int]struct{}, error) {
	SQLString := `
		SELECT friend_id
		FROM user_friends
		WHERE user_id = $1
	`

	friendMap := make(map[int]struct{})
	var rows pgx.Rows
	if v, err := uf.m.db.Query(ctx, SQLString, userID); err != nil {
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
