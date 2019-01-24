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
	defer rows.Close()

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

func (*DiscordWaiters) Insert(waiter *Waiter) error {
	var stmt *sql.Stmt
	if v, err := db.Prepare(`
		INSERT INTO discord_waiters (username, discord_mention, datetime_expired)
		VALUES (?, ?, ?)
	`); err != nil {
		return err
	} else {
		stmt = v
	}
	defer stmt.Close()

	_, err := stmt.Exec(waiter.Username, waiter.DiscordMention, waiter.DatetimeExpired)
	return err
}

func (*DiscordWaiters) Delete(username string) error {
	var stmt *sql.Stmt
	if v, err := db.Prepare(`
		DELETE FROM discord_waiters
		WHERE username = ?
	`); err != nil {
		return err
	} else {
		stmt = v
	}
	defer stmt.Close()

	_, err := stmt.Exec(username)
	return err
}

func (*DiscordWaiters) DeleteAll() error {
	var stmt *sql.Stmt
	if v, err := db.Prepare(`
		DELETE FROM discord_waiters
	`); err != nil {
		return err
	} else {
		stmt = v
	}
	defer stmt.Close()

	_, err := stmt.Exec()
	return err
}
