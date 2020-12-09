package models

import (
	"context"

	"github.com/jackc/pgx/v4"
)

type UserReverseFriends struct {
	m *Models // Reverse reference
}

func (urf *UserReverseFriends) Insert(ctx context.Context, userID int, friendID int) error {
	SQLString := `
		INSERT INTO user_reverse_friends (user_id, friend_id)
		VALUES ($1, $2)
	`

	_, err := urf.m.db.Exec(ctx, SQLString, userID, friendID)
	return err
}

func (urf *UserReverseFriends) Delete(ctx context.Context, userID int, friendID int) error {
	SQLString := `
		DELETE FROM user_reverse_friends
		WHERE user_id = $1
			AND friend_id = $2
	`

	_, err := urf.m.db.Exec(ctx, SQLString, userID, friendID)
	return err
}

func (urf *UserReverseFriends) GetMap(ctx context.Context, userID int) (map[int]struct{}, error) {
	SQLString := `
		SELECT friend_id
		FROM user_reverse_friends
		WHERE user_id = $1
	`

	friendMap := make(map[int]struct{})
	var rows pgx.Rows
	if v, err := urf.m.db.Query(ctx, SQLString, userID); err != nil {
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
