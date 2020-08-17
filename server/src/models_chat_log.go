package main

import (
	"context"
	"database/sql"
	"strconv"
	"strings"
	"time"
)

type ChatLog struct{}

// ChatLogRow mirrors the "chat_log" table row
type ChatLogRow struct {
	UserID  int
	Message string
	Room    string
}

func (*ChatLog) Insert(userID int, message string, room string) error {
	_, err := db.Exec(context.Background(), `
		INSERT INTO chat_log (user_id, message, room)
		VALUES ($1, $2, $3)
	`, userID, message, room)
	return err
}

func (*ChatLog) BulkInsert(chatLogRows []*ChatLogRow) error {
	SQLString := `
		INSERT INTO chat_log (user_id, message, room)
		VALUES
	`
	for _, chatLogRow := range chatLogRows {
		SQLString += "(" +
			strconv.Itoa(chatLogRow.UserID) + ", " +
			"'" + chatLogRow.Message + "', " +
			"'" + chatLogRow.Room + "'" +
			"), "
	}
	SQLString = strings.TrimSuffix(SQLString, ", ")

	_, err := db.Exec(context.Background(), SQLString)
	return err
}

func (*ChatLog) InsertDiscord(discordName string, message string, room string) error {
	_, err := db.Exec(context.Background(), `
		INSERT INTO chat_log (user_id, discord_name, message, room)
		VALUES (0, $1, $2, $3)
	`, discordName, message, room)
	return err
}

type DBChatMessage struct {
	Name        string         `json:"name"`
	DiscordName sql.NullString `json:"discordName"`
	Message     string         `json:"message"`
	Datetime    time.Time      `json:"datetime"`
}

// Get the past messages sent in the lobby
func (*ChatLog) Get(room string, count int) ([]DBChatMessage, error) {
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
		SQLString += "LIMIT " + strconv.Itoa(count)
	}

	rows, err := db.Query(context.Background(), SQLString, room)

	chatMessages := make([]DBChatMessage, 0)
	for rows.Next() {
		var message DBChatMessage
		if err2 := rows.Scan(
			&message.Name,
			&message.DiscordName,
			&message.Message,
			&message.Datetime,
		); err2 != nil {
			return nil, err2
		}
		chatMessages = append(chatMessages, message)
	}

	if rows.Err() != nil {
		return nil, err
	}
	rows.Close()

	return chatMessages, nil
}
