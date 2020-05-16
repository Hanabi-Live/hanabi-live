package main

import (
	"context"
	"database/sql"
	"errors"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v4"
	"github.com/mozillazg/go-unidecode"
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

func (*Users) NormalizedUsernameExists(normalizedUsername string) (bool, error) {
	var count int
	if err := db.QueryRow(context.Background(), `
		SELECT COUNT(id)
		FROM users
		WHERE normalized_username = $1
	`, normalizedUsername).Scan(&count); err != nil {
		return false, err
	} else if count != 0 && count != 1 {
		return false, errors.New("more than one user matches a username of " +
			"\"" + normalizedUsername + "\"")
	}

	return count == 1, nil
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

func (Users) CheckDuplicateUsernames() error {
	rows, err := db.Query(context.Background(), `
		SELECT id, username
		FROM users
		ORDER BY id
	`)

	users := make([]User, 0)
	for rows.Next() {
		var user User
		if err2 := rows.Scan(&user.ID, &user.Username); err2 != nil {
			return err2
		}
		users = append(users, user)
	}

	if rows.Err() != nil {
		return err
	}
	rows.Close()

	usernameMap := make(map[string]string)
	userIDMap := make(map[string]int)
	for _, user := range users {
		normalizedUsername := strings.ToLower(unidecode.Unidecode(user.Username))

		if duplicateUsername, ok := usernameMap[normalizedUsername]; ok {
			logger.Error("User " + strconv.Itoa(user.ID) + " with username " +
				"\"" + user.Username + "\" " + "contains a duplicate username with " +
				"\"" + duplicateUsername + "\", " + strconv.Itoa(userIDMap[normalizedUsername]))
		} else {
			usernameMap[normalizedUsername] = user.Username
			userIDMap[normalizedUsername] = user.ID
		}
	}

	return nil
}

func (Users) PopulateNormalizedUsernames() error {
	rows, err := db.Query(context.Background(), `
		SELECT id, username
		FROM users
		ORDER BY id
	`)

	users := make([]User, 0)
	for rows.Next() {
		var user User
		if err2 := rows.Scan(&user.ID, &user.Username); err2 != nil {
			return err2
		}
		users = append(users, user)
	}

	if rows.Err() != nil {
		return err
	}
	rows.Close()

	for _, user := range users {
		normalizedUsername := strings.ToLower(unidecode.Unidecode(user.Username))

		if _, err := db.Exec(context.Background(), `
			UPDATE users
			SET normalized_username = $1
			WHERE id = $2
		`, normalizedUsername, user.ID); err != nil {
			return err
		}
	}

	return nil
}
