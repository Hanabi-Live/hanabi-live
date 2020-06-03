package main

import (
	"context"

	"github.com/jackc/pgx/v4"
)

type BannedIPs struct{}

func (*BannedIPs) Check(ip string) (bool, error) {
	var id int
	if err := db.QueryRow(context.Background(), `
		SELECT id
		FROM banned_ips
		WHERE ip = $1
	`, ip).Scan(&id); err == pgx.ErrNoRows {
		return false, nil
	} else if err != nil {
		return false, err
	}

	return true, nil
}

func (*BannedIPs) Insert(ip string, userID int) error {
	_, err := db.Exec(context.Background(), `
		INSERT INTO banned_ips (ip, user_id)
		VALUES ($1, $2)
	`, ip, userID)
	return err
}
