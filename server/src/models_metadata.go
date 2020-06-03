package main

import (
	"context"
)

type Metadata struct{}

func (*Metadata) Get(name string) (string, error) {
	var value string
	if err := db.QueryRow(context.Background(), `
		SELECT value
		FROM metadata
		WHERE name = $1
	`, name).Scan(&value); err != nil {
		return "", err
	}

	return value, nil
}

func (*Metadata) Put(name string, value string) error {
	_, err := db.Exec(context.Background(), `
		UPDATE metadata
		SET value = $1
		WHERE name = $2
	`, value, name)
	return err
}

func (*Metadata) TestDatabase() error {
	var id int
	err := db.QueryRow(context.Background(), `
		SELECT id
		FROM metadata
		LIMIT 1
	`).Scan(&id)
	return err
}
