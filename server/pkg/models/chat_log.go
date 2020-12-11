package models

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/jackc/pgx/v4"
)

type ChatLog struct {
	m *Models // Reverse reference
}

// ChatLogRow mirrors the "chat_log" database table row.
type ChatLogRow struct {
	UserID  int
	Message string
	Room    string
}

func (cl *ChatLog) Insert(ctx context.Context, userID int, message string, room string) error {
	SQLString := `
		INSERT INTO chat_log (user_id, message, room)
		VALUES ($1, $2, $3)
	`

	_, err := cl.m.db.Exec(ctx, SQLString, userID, message, room)
	return err
}

func (cl *ChatLog) BulkInsert(ctx context.Context, chatLogRows []*ChatLogRow) error {
	SQLString := `
		INSERT INTO chat_log (user_id, message, room)
		VALUES %s
	`

	numArgsPerRow := 3
	valueArgs := make([]interface{}, 0, numArgsPerRow*len(chatLogRows))
	for _, chatLogRow := range chatLogRows {
		valueArgs = append(valueArgs, chatLogRow.UserID, chatLogRow.Message, chatLogRow.Room)
	}
	SQLString = getBulkInsertSQLSimple(SQLString, numArgsPerRow, len(chatLogRows))

	_, err := cl.m.db.Exec(ctx, SQLString, valueArgs...)
	return err
}

func (cl *ChatLog) InsertDiscord(
	ctx context.Context,
	discordName string,
	message string,
	room string,
) error {
	SQLString := `
		INSERT INTO chat_log (user_id, discord_name, message, room)
		VALUES (0, $1, $2, $3)
	`

	_, err := cl.m.db.Exec(ctx, SQLString, discordName, message, room)
	return err
}

type DBChatMessage struct {
	Name        string         `json:"name"`
	DiscordName sql.NullString `json:"discordName"`
	Message     string         `json:"message"`
	Datetime    time.Time      `json:"datetime"`
}

func (cl *ChatLog) Get(ctx context.Context, room string, count int) ([]DBChatMessage, error) {
	SQLString := `
		SELECT
			COALESCE(users.username, '__server'),
			chat_log.discord_name,
			chat_log.message,
			chat_log.datetime_sent
		FROM
			chat_log
		LEFT JOIN
			users ON users.id = chat_log.user_id
		WHERE
			room = $1
		ORDER BY
			chat_log.datetime_sent DESC
	`
	if count > 0 {
		SQLString += fmt.Sprintf("LIMIT %v", count)
	}

	chatMessages := make([]DBChatMessage, 0)
	var rows pgx.Rows
	if v, err := cl.m.db.Query(ctx, SQLString, room); err != nil {
		return chatMessages, err
	} else {
		rows = v
	}

	for rows.Next() {
		var message DBChatMessage
		if err := rows.Scan(
			&message.Name,
			&message.DiscordName,
			&message.Message,
			&message.Datetime,
		); err != nil {
			return chatMessages, err
		}
		chatMessages = append(chatMessages, message)
	}

	if err := rows.Err(); err != nil {
		return chatMessages, err
	}
	rows.Close()

	return chatMessages, nil
}
