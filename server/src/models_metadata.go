package main

import (
	"context"
)

type Metadata struct{}

func (*Metadata) TestDatabase() error {
	var id int
	err := db.QueryRow(context.Background(), `
		SELECT id
		FROM metadata
		LIMIT 1
	`).Scan(&id)
	return err
}
