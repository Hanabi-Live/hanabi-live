package models

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v4"
)

type MutedIPs struct {
	m *Models // Reverse reference
}

func (m *MutedIPs) Check(ctx context.Context, ip string) (bool, error) {
	SQLString := `
		SELECT id
		FROM muted_ips
		WHERE ip = $1
	`

	var id int
	if err := m.m.db.QueryRow(ctx, SQLString, ip).Scan(&id); errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	} else if err != nil {
		return false, err
	}

	return true, nil
}

func (m *MutedIPs) Insert(ctx context.Context, ip string, userID int) error {
	SQLString := `
		INSERT INTO muted_ips (ip, user_id)
		VALUES ($1, $2)
	`

	_, err := m.m.db.Exec(ctx, SQLString, ip, userID)
	return err
}
