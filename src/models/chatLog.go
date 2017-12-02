package models

import (
	"database/sql"
)

type ChatLog struct{}

func (*ChatLog) Insert(userID int, message string) error {
	var stmt *sql.Stmt
	if v, err := db.Prepare(`
		INSERT INTO chat_log (user_id, message)
		VALUES (?, ?)
	`); err != nil {
		return err
	} else {
		stmt = v
	}
	defer stmt.Close()

	if _, err := stmt.Exec(userID, message); err != nil {
		return err
	}

	return nil
}

type ChatMessage struct {
	Name     string `json:"name"`
	Message  string `json:"message"`
	Datetime int64  `json:"datetime"`
}

// Get the past messages sent in this room
func (*ChatLog) Get(room string, count int) ([]ChatMessage, error) {
	var rows *sql.Rows
	if v, err := db.Query(`
		SELECT
			users.username,
			chat_log.message,
			UNIX_TIMESTAMP(chat_log.datetime_sent)
		FROM
			chat_log
		JOIN
			users ON users.id = chat_log.user_id
		ORDER BY
			chat_log.datetime_sent DESC
		LIMIT
			?
	`, room, count); err != nil {
		return nil, err
	} else {
		rows = v
	}
	defer rows.Close()

	chatMessages := make([]ChatMessage, 0)
	for rows.Next() {
		var message ChatMessage
		if err := rows.Scan(
			&message.Name,
			&message.Message,
			&message.Datetime,
		); err != nil {
			return nil, err
		}
		chatMessages = append(chatMessages, message)
	}

	return chatMessages, nil
}
