package main

import (
	"context"
)

type ChatLogPM struct{}

func (*ChatLogPM) Insert(userID int, message string, recipientID int) error {
	_, err := db.Exec(context.Background(), `
		INSERT INTO chat_log_pm (user_id, recipient_id, message)
		VALUES ($1, $2, $3)
	`, userID, recipientID, message)
	return err
}
