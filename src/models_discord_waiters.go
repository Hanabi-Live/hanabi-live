package main

import (
	"context"
	"time"
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

	rows, err := db.Query(context.Background(), `
		SELECT
			username,
			discord_mention,
			datetime_expired
		FROM discord_waiters
	`)

	for rows.Next() {
		var waiter Waiter
		if err2 := rows.Scan(
			&waiter.Username,
			&waiter.DiscordMention,
			&waiter.DatetimeExpired,
		); err2 != nil {
			return nil, err2
		}
		waiters = append(waiters, &waiter)
	}

	if rows.Err() != nil {
		return nil, err
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
