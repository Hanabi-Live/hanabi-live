package models

import (
	"database/sql"
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

	var rows *sql.Rows
	if v, err := db.Query(`
		SELECT
			username,
			discord_mention,
			datetime_expired
		FROM discord_waiters
	`); err == sql.ErrNoRows {
		return waiters, nil
	} else if err != nil {
		return waiters, err
	} else {
		rows = v
	}
	defer rows.Close() // nolint: errcheck

	for rows.Next() {
		var waiter Waiter
		if err := rows.Scan(
			&waiter.Username,
			&waiter.DiscordMention,
			&waiter.DatetimeExpired,
		); err != nil {
			return nil, err
		}
		waiters = append(waiters, &waiter)
	}

	return waiters, nil
}
