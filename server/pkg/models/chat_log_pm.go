package models

import (
	"context"
)

type ChatLogPM struct {
	m *Models // Reverse reference
}

func (clp *ChatLogPM) Insert(ctx context.Context, userID int, message string, recipientID int) error {
	SQLString := `
		INSERT INTO chat_log_pm (user_id, recipient_id, message)
		VALUES ($1, $2, $3)
	`

	_, err := clp.m.db.Exec(ctx, SQLString, userID, recipientID, message)
	return err
}
