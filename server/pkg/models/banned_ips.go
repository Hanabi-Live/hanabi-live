package models

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v4"
)

type BannedIPs struct {
	m *Models // Reverse reference
}

func (b *BannedIPs) Check(ctx context.Context, ip string) (bool, error) {
	SQLString := `
		SELECT id
		FROM banned_ips
		WHERE ip = $1
	`

	var id int
	if err := b.m.db.QueryRow(ctx, SQLString, ip).Scan(&id); errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	} else if err != nil {
		return false, err
	}

	return true, nil
}

func (b *BannedIPs) Insert(ctx context.Context, ip string, userID int) error {
	SQLString := `
		INSERT INTO banned_ips (ip, user_id)
		VALUES ($1, $2)
	`

	_, err := b.m.db.Exec(ctx, SQLString, ip, userID)
	return err
}
