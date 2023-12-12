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
		var linkedUser string
		if err := rows.Scan(&linkedUser); err != nil {
			return linkedUsers, err
		}
		linkedUsers = append(linkedUsers, linkedUser)
	}
	linkedUsers = sortStringsCaseInsensitive(linkedUsers)

	if err := rows.Err(); err != nil {
		return linkedUsers, err
	}
	rows.Close()

	return linkedUsers, nil
}

func (*UserLinkages) isLinked(userID int, linkedID int) (bool, error) {
	var rows pgx.Rows
	if v, err := db.Query(context.Background(), `
		SELECT COUNT(*)
        FROM user_linkages
        WHERE user_id = $1
          AND linked_id = $2
    `, userID, linkedID); err != nil {
		return false, err
	} else {
		rows = v
	}

	var isLinked int
	for rows.Next() {
		if err := rows.Scan(&isLinked); err != nil {
			return false, err
		}
	}

	return isLinked > 0, nil
}

// GetBlockedSeeds composes a map that represents all the seeds that have been played by the specified users
// or by one of their linked accounts.
// Note that we use a map to represent these seeds, since this is faster to iterate through
func (*UserLinkages) GetBlockedSeeds(userIDs []int) (map[string]struct{}, error) {
	blockedSeeds := make(map[string]struct{})
	var rows pgx.Rows
	if v, err := db.Query(context.Background(), `
		SELECT DISTINCT
            games.seed AS seed
		FROM user_linkages
        JOIN game_participants
            ON user_linkages.linked_id = game_participants.user_id
        JOIN games
            ON games.id = game_participants.game_id
		WHERE user_linkages.user_id = ANY ($1)

		UNION DISTINCT

		SELECT DISTINCT
            games.seed AS seed
        FROM game_participants
        JOIN games
            ON games.id = game_participants.game_id
        WHERE game_participants.user_id = ANY ($1)
        ORDER BY seed
	`, userIDs); err != nil {
		return nil, err
	} else {
		rows = v
	}

	for rows.Next() {
		var seed string
		if err := rows.Scan(&seed); err != nil {
			return blockedSeeds, err
		}
		blockedSeeds[seed] = struct{}{}
	}

	if err := rows.Err(); err != nil {
		return blockedSeeds, err
	}
	rows.Close()

	return blockedSeeds, nil
}
