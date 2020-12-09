package models

import (
	"context"
)

type Metadata struct {
	m *Models // Reverse reference
}

func (m *Metadata) Get(ctx context.Context, name string) (string, error) {
	SQLString := `
		SELECT value
		FROM metadata
		WHERE name = $1
	`

	var value string
	if err := m.m.db.QueryRow(ctx, SQLString, name).Scan(&value); err != nil {
		return "", err
	}

	return value, nil
}

func (m *Metadata) Put(ctx context.Context, name string, value string) error {
	SQLString := `
		UPDATE metadata
		SET value = $1
		WHERE name = $2
	`

	_, err := m.m.db.Exec(ctx, SQLString, value, name)
	return err
}

func (m *Metadata) TestDatabase(ctx context.Context) error {
	SQLString := `
		SELECT id
		FROM metadata
		LIMIT 1
	`

	var id int
	err := m.m.db.QueryRow(ctx, SQLString).Scan(&id)
	return err
}
