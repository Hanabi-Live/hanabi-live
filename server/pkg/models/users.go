package models

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"github.com/jackc/pgx/v4"
)

type Users struct {
	m *Models // Reverse reference
}

type User struct {
	ID              int
	Username        string
	PasswordHash    sql.NullString
	OldPasswordHash sql.NullString
}

func (u *Users) Insert(
	ctx context.Context,
	username string,
	normalizedUsername string,
	passwordHash string,
	lastIP string,
) (User, error) {
	// https://www.postgresql.org/docs/9.5/dml-returning.html
	// https://github.com/jackc/pgx/issues/411
	SQLString := `
		INSERT INTO users (username, normalized_username, password_hash, last_ip)
		VALUES ($1, $2, $3, $4)
		RETURNING id
	`

	var user User
	var id int
	if err := u.m.db.QueryRow(
		ctx,
		SQLString,
		username,
		normalizedUsername,
		passwordHash,
		lastIP,
	).Scan(&id); err != nil {
		return user, err
	}

	return User{
		ID:              id,
		Username:        username,
		PasswordHash:    sql.NullString{},
		OldPasswordHash: sql.NullString{},
	}, nil
}

// Get retrieves data for a user from the database corresponding to a username.
// We need to return the existing username in case the end-user submitted the wrong case.
func (u *Users) Get(ctx context.Context, username string) (bool, User, error) {
	SQLString := `
		SELECT
			id,
			username,
			password_hash,
			old_password_hash
		FROM users
		WHERE username = $1
	`

	var user User
	if err := u.m.db.QueryRow(ctx, SQLString, username).Scan(
		&user.ID,
		&user.Username,
		&user.PasswordHash,
		&user.OldPasswordHash,
	); errors.Is(err, pgx.ErrNoRows) {
		return false, user, nil
	} else if err != nil {
		return false, user, err
	}

	return true, user, nil
}

func (u *Users) GetUserFromNormalizedUsername(
	ctx context.Context,
	normalizedUsername string,
) (bool, User, error) {
	SQLString := `
		SELECT
			id,
			username
		FROM users
		WHERE normalized_username = $1
	`

	var user User
	if err := u.m.db.QueryRow(ctx, SQLString, normalizedUsername).Scan(
		&user.ID,
		&user.Username,
	); errors.Is(err, pgx.ErrNoRows) {
		return false, user, nil
	} else if err != nil {
		return false, user, err
	}

	return true, user, nil
}

func (u *Users) GetUsername(ctx context.Context, userID int) (string, error) {
	SQLString := `
		SELECT username
		FROM users
		WHERE id = $1
	`

	var username string
	err := u.m.db.QueryRow(ctx, SQLString, userID).Scan(&username)
	return username, err
}

func (u *Users) GetLastIP(ctx context.Context, username string) (string, error) {
	SQLString := `
		SELECT last_ip
		FROM users
		WHERE username = $1
	`

	var lastIP string
	err := u.m.db.QueryRow(ctx, SQLString, username).Scan(&lastIP)
	return lastIP, err
}

func (u *Users) GetDatetimeCreated(ctx context.Context, userID int) (time.Time, error) {
	SQLString := `
		SELECT datetime_created
		FROM users
		WHERE id = $1
	`

	var datetimeCreated time.Time
	err := u.m.db.QueryRow(ctx, SQLString, userID).Scan(&datetimeCreated)
	return datetimeCreated, err
}

func (u *Users) NormalizedUsernameExists(
	ctx context.Context,
	normalizedUsername string,
) (bool, string, error) {
	SQLString := `
		SELECT username
		FROM users
		WHERE normalized_username = $1
	`

	var similarUsername string
	if err := u.m.db.QueryRow(
		ctx,
		SQLString,
		normalizedUsername,
	).Scan(&similarUsername); errors.Is(err, pgx.ErrNoRows) {
		return false, "", nil
	} else if err != nil {
		return false, "", err
	}

	return true, similarUsername, nil
}

func (u *Users) Update(ctx context.Context, userID int, lastIP string) error {
	SQLString := `
		UPDATE users
		SET
			datetime_last_login = NOW(),
			last_ip = $1
		WHERE id = $2
	`

	_, err := u.m.db.Exec(ctx, SQLString, lastIP, userID)
	return err
}

// UpdatePassword is a legacy function; delete this when all users have logged in or in 2022,
// whichever comes first.
func (u *Users) UpdatePassword(ctx context.Context, userID int, passwordHash string) error {
	SQLString := `
		UPDATE users
		SET
			password_hash = $1,
			old_password_hash = NULL
		WHERE id = $2
	`

	_, err := u.m.db.Exec(ctx, SQLString, passwordHash, userID)
	return err
}
