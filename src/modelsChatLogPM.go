package main

import (
	"database/sql"
)

type ChatLogPM struct{}

func (*ChatLogPM) Insert(userID int, message string, recipientID int) error {
	var stmt *sql.Stmt
	if v, err := db.Prepare(`
		INSERT INTO chat_log_pm (user_id, recipient_id, message)
		VALUES (?, ?, ?)
	`); err != nil {
		return err
	} else {
		stmt = v
	}
	defer stmt.Close()

	_, err := stmt.Exec(userID, recipientID, message)
	return err
}
