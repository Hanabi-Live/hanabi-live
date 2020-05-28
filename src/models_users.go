package main

import (
	"context"
	"database/sql"
	"time"

	"github.com/jackc/pgx/v4"
)

type Users struct{}

type User struct {
	ID              int
	Username        string
	PasswordHash    sql.NullString
	OldPasswordHash sql.NullString
}

func (*Users) Insert(
	username string,
	normalizedUsername string,
	passwordHash string,
	lastIP string,
) (User, error) {
	var user User

	// https://www.postgresql.org/docs/9.5/dml-returning.html
	// https://github.com/jackc/pgx/issues/411
	var id int
	if err := db.QueryRow(context.Background(), `
		INSERT INTO users (username, normalized_username, password_hash, last_ip)
		VALUES ($1, $2, $3, $4)
		RETURNING id
	`, username, normalizedUsername, passwordHash, lastIP).Scan(&id); err != nil {
		return user, err
	}

	return User{
		ID:       id,
		Username: username,
	}, nil
}

// We need to return the existing username in case they submitted the wrong case
func (*Users) Get(username string) (bool, User, error) {
	var user User
	if err := db.QueryRow(context.Background(), `
		SELECT
			id,
			username,
			password_hash,
			old_password_hash
		FROM users
		WHERE username = $1
	`, username).Scan(
		&user.ID,
		&user.Username,
		&user.PasswordHash,
		&user.OldPasswordHash,
	); err == pgx.ErrNoRows {
		return false, user, nil
	} else if err != nil {
		return false, user, err
	}

	return true, user, nil
}

func (*Users) GetUserFromNormalizedUsername(normalizedUsername string) (bool, User, error) {
	var user User
	if err := db.QueryRow(context.Background(), `
		SELECT
			id,
			username
		FROM users
		WHERE normalized_username = $1
	`, normalizedUsername).Scan(
		&user.ID,
		&user.Username,
	); err == pgx.ErrNoRows {
		return false, user, nil
	} else if err != nil {
		return false, user, err
	}

	return true, user, nil
}

func (*Users) GetUsername(userID int) (string, error) {
	var username string
	err := db.QueryRow(context.Background(), `
		SELECT username
		FROM users
		WHERE id = $1
	`, userID).Scan(&username)
	return username, err
}

func (*Users) GetLastIP(username string) (string, error) {
	var lastIP string
	err := db.QueryRow(context.Background(), `
		SELECT last_ip
		FROM users
		WHERE username = $1
	`, username).Scan(&lastIP)
	return lastIP, err
}

func (*Users) GetDatetimeCreated(userID int) (time.Time, error) {
	var datetimeCreated time.Time
	err := db.QueryRow(context.Background(), `
		SELECT datetime_created
		FROM users
		WHERE id = $1
	`, userID).Scan(&datetimeCreated)
	return datetimeCreated, err
}

func (*Users) NormalizedUsernameExists(normalizedUsername string) (bool, string, error) {
	var similarUsername string
	if err := db.QueryRow(context.Background(), `
		SELECT username
		FROM users
		WHERE normalized_username = $1
	`, normalizedUsername).Scan(&similarUsername); err == pgx.ErrNoRows {
		return false, "", nil
	} else if err != nil {
		return false, "", err
	}

	return true, similarUsername, nil
}

func (*Users) Update(userID int, lastIP string) error {
	_, err := db.Exec(context.Background(), `
		UPDATE users
		SET
			datetime_last_login = NOW(),
			last_ip = $1
		WHERE id = $2
	`, lastIP, userID)
	return err
}

// Legacy function; delete this when all users have logged in or in 2022, whichever comes first
func (*Users) UpdatePassword(userID int, passwordHash string) error {
	_, err := db.Exec(context.Background(), `
		UPDATE users
		SET
			password_hash = $1,
			old_password_hash = NULL
		WHERE id = $2
	`, passwordHash, userID)
	return err
}
