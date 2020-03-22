package main

import (
	"database/sql"
)

type DiscordMetadata struct{}

func (*DiscordMetadata) Get(name string) (string, error) {
	var value string
	if err := db.QueryRow(`
		SELECT value
		FROM discord_metadata
		WHERE name = ?
	`, name).Scan(&value); err != nil {
		return "", err
	}

	return value, nil
}

func (*DiscordMetadata) Put(name string, value string) error {
	var stmt *sql.Stmt
	if v, err := db.Prepare(`
		UPDATE discord_metadata
		SET value = ?
		WHERE name = ?
	`); err != nil {
		return err
	} else {
		stmt = v
	}
	defer stmt.Close()

	_, err := stmt.Exec(value, name)
	return err
}

func (*DiscordMetadata) TestDatabase() error {
	var id string
	err := db.QueryRow(`
		SELECT id
		FROM discord_metadata
		LIMIT 1
	`).Scan(&id)
	return err
}
