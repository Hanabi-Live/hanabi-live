package models

import (
	"database/sql"
)

type Users struct{}

type User struct {
	ID       int
	Username string
	Password string
	Admin    bool
}

func (*Users) Insert(username string, password string) (User, error) {
	var user User

	var stmt *sql.Stmt
	if v, err := db.Prepare(`
		INSERT INTO users (username, password)
		VALUES (?, ?)
	`); err != nil {
		return user, err
	} else {
		stmt = v
	}
	defer stmt.Close()

	var res sql.Result
	if v, err := stmt.Exec(username, password); err != nil {
		return user, err
	} else {
		res = v
	}

	var id int
	if v, err := res.LastInsertId(); err != nil {
		return user, err
	} else {
		id = int(v)
	}

	return User{
		ID:       id,
		Username: username,
		Password: password,
	}, nil
}

// Get is used when a user is logging in
// We need to get the existing username in case they submitted the wrong case
func (*Users) Get(username string) (bool, User, error) {
	var user User
	if err := db.QueryRow(`
		SELECT id, username, password, admin
		FROM users
		WHERE username = ?
	`, username).Scan(&user.ID, &user.Username, &user.Password, &user.Admin); err == sql.ErrNoRows {
		return false, user, nil
	} else if err != nil {
		return false, user, err
	}

	return true, user, nil
}

func (*Users) GetUsername(userID int) (string, error) {
	var username string
	err := db.QueryRow(`
		SELECT username
		FROM users
		WHERE id = ?
	`, userID).Scan(&username)
	return username, err
}

func (*Users) Update(userID int, lastIP string) error {
	var stmt *sql.Stmt
	if v, err := db.Prepare(`
		UPDATE users
		SET datetime_last_login = NOW(), last_ip = ?
		WHERE id = ?
	`); err != nil {
		return err
	} else {
		stmt = v
	}
	defer stmt.Close()

	_, err := stmt.Exec(lastIP, userID)
	return err
}
