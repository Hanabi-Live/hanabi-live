package main

import (
	"context"
	"time"

	"github.com/jackc/pgx/v4"
)

type DiscordWaiters struct{}

// Waiter is a person who is on the waiting list for the next game
// (they used the "/next" Discord command)
type Waiter struct {
	Username        string
	DiscordMention  string
	DatetimeExpired time.Time
}

func (*DiscordWaiters) GetAll() ([]*Waiter, error) {
	waiters := make([]*Waiter, 0)

	var rows pgx.Rows
	if v, err := db.Query(context.Background(), `
		SELECT
			username,
			discord_mention,
			datetime_expired
		FROM discord_waiters
	`); err != nil {
		return waiters, err
	} else {
		rows = v
	}

	for rows.Next() {
		var waiter Waiter
		if err := rows.Scan(
			&waiter.Username,
			&waiter.DiscordMention,
			&waiter.DatetimeExpired,
		); err != nil {
			return waiters, err
		}
		waiters = append(waiters, &waiter)
	}

	if err := rows.Err(); err != nil {
		return waiters, err
	}
	rows.Close()

	return waiters, nil
}

func (*DiscordWaiters) Insert(waiter *Waiter) error {
	_, err := db.Exec(context.Background(), `
		INSERT INTO discord_waiters (username, discord_mention, datetime_expired)
		VALUES ($1, $2, $3)
	`, waiter.Username, waiter.DiscordMention, waiter.DatetimeExpired)
	return err
}

func (*DiscordWaiters) Delete(username string) error {
	_, err := db.Exec(context.Background(), `
		DELETE FROM discord_waiters
		WHERE username = $1
	`, username)
	return err
}

func (*DiscordWaiters) DeleteAll() error {
	_, err := db.Exec(context.Background(), "DELETE FROM discord_waiters")
	return err
}
