package main

import (
	"context"
)

type DiscordMetadata struct{}

func (*DiscordMetadata) Get(name string) (string, error) {
	var value string
	if err := db.QueryRow(context.Background(), `
		SELECT value
		FROM discord_metadata
		WHERE name = $1
	`, name).Scan(&value); err != nil {
		return "", err
	}

	return value, nil
}

func (*DiscordMetadata) Put(name string, value string) error {
	_, err := db.Exec(context.Background(), `
		UPDATE discord_metadata
		SET value = $1
		WHERE name = $2
	`, value, name)
	return err
}

func (*DiscordMetadata) TestDatabase() error {
	var id int
	err := db.QueryRow(context.Background(), `
		SELECT id
		FROM discord_metadata
		LIMIT 1
	`).Scan(&id)
	return err
}
