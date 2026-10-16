package main

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"github.com/jackc/pgx/v4"
)

type ChatLog struct{}

func chatLogSourceForUserID(userID int) ChatLogSource {
	if userID == 0 {
		return ChatLogSourceServer
	}
	return ChatLogSourceUser
}

type ChatLogInsertResult struct {
	ID           int
	DatetimeSent time.Time
}

// ChatLogRow mirrors the "chat_log" table row
type ChatLogRow struct {
	UserID  int
	Message string
	Room    string
}

func (*ChatLog) Insert(userID int, message string, room string) (ChatLogInsertResult, error) {
	var result ChatLogInsertResult
	err := db.QueryRow(context.Background(), `
		INSERT INTO chat_log (user_id, source, message, room)
		VALUES ($1, $2, $3, $4)
		RETURNING id, datetime_sent
	`, userID, string(chatLogSourceForUserID(userID)), message, room).Scan(
		&result.ID,
		&result.DatetimeSent,
	)
	return result, err
}

func (*ChatLog) BulkInsert(chatLogRows []*ChatLogRow) error {
	SQLString := `
		INSERT INTO chat_log (user_id, source, message, room)
		VALUES %s
	`
	numArgsPerRow := 4
	valueArgs := make([]interface{}, 0, numArgsPerRow*len(chatLogRows))
	for _, chatLogRow := range chatLogRows {
		valueArgs = append(valueArgs, chatLogRow.UserID, string(chatLogSourceForUserID(chatLogRow.UserID)), chatLogRow.Message, chatLogRow.Room)
	}
	SQLString = getBulkInsertSQLSimple(SQLString, numArgsPerRow, len(chatLogRows))

	_, err := db.Exec(context.Background(), SQLString, valueArgs...)
	return err
}

func (*ChatLog) InsertDiscord(
	discordName string,
	message string,
	room string,
	discordMessageID string,
) (ChatLogInsertResult, error) {
	var result ChatLogInsertResult
	err := db.QueryRow(context.Background(), `
		INSERT INTO chat_log (user_id, source, discord_name, message, room, discord_message_id)
		VALUES (0, 'discord', $1, $2, $3, NULLIF($4, ''))
		ON CONFLICT (discord_message_id) WHERE discord_message_id IS NOT NULL DO NOTHING
		RETURNING id, datetime_sent
	`, discordName, message, room, discordMessageID).Scan(
		&result.ID,
		&result.DatetimeSent,
	)
	return result, err
}

// LinkDiscordMessageID associates a lobby chat row with the copy created by
// the Discord bot. If a MessageDelete arrived before the link, a tombstone
// already owns the Discord ID. In that case scrub the original chat row and
// tell the caller to broadcast its removal.
func (*ChatLog) LinkDiscordMessageID(chatID int, discordMessageID string) (bool, error) {
	if chatID <= 0 || discordMessageID == "" {
		return false, nil
	}

	ctx := context.Background()
	_, err := db.Exec(ctx, `
		UPDATE chat_log
		SET discord_message_id = $2
		WHERE id = $1 AND room = 'lobby' AND deleted_at IS NULL
	`, chatID, discordMessageID)
	if err == nil {
		return false, nil
	}

	// A concurrent delete may have inserted a tombstone before this UPDATE.
	// Check the unique-index violation, then scrub only if that ID was deleted.
	var sqlStateError interface{ SQLState() string }
	if !errors.As(err, &sqlStateError) || sqlStateError.SQLState() != "23505" {
		return false, err
	}

	var deletedID int
	deleteErr := db.QueryRow(ctx, `
		UPDATE chat_log AS original
		SET message = '', discord_name = NULL, deleted_at = NOW()
		WHERE original.id = $1 AND original.deleted_at IS NULL
		AND EXISTS (
			SELECT 1 FROM chat_log AS tombstone
			WHERE tombstone.discord_message_id = $2 AND tombstone.deleted_at IS NOT NULL
		)
		RETURNING original.id
	`, chatID, discordMessageID).Scan(&deletedID)
	if errors.Is(deleteErr, pgx.ErrNoRows) {
		// A duplicate live Discord ID is not a deletion; preserve the error.
		return false, err
	}
	if deleteErr != nil {
		return false, deleteErr
	}
	return true, nil
}

// DeleteDiscord clears the content of a Discord message and retains its ID so
// duplicate or out-of-order MessageCreate events cannot resurrect it. An
// unseen deletion inserts an empty tombstone; only the first deletion returns
// a chat ID, so repeat delete events do not trigger broadcasts.
func (*ChatLog) DeleteDiscord(discordMessageID string) (int, error) {
	var chatID int
	err := db.QueryRow(context.Background(), `
		INSERT INTO chat_log (user_id, source, message, room, discord_message_id, deleted_at)
		VALUES (0, 'discord', '', 'lobby', $1, NOW())
		ON CONFLICT (discord_message_id) WHERE discord_message_id IS NOT NULL
		DO UPDATE SET
			message = '',
			discord_name = NULL,
			deleted_at = EXCLUDED.deleted_at
		WHERE chat_log.deleted_at IS NULL
		RETURNING id
	`, discordMessageID).Scan(&chatID)
	return chatID, err
}

type DBChatMessage struct {
	ID          int            `json:"id"`
	UserID      int            `json:"userID"`
	Source      ChatLogSource  `json:"source"`
	Name        string         `json:"name"`
	DiscordName sql.NullString `json:"discordName"`
	Message     string         `json:"message"`
	Datetime    time.Time      `json:"datetime"`
}

// GetHistory returns a page of persisted lobby messages in descending chat ID
// order. Fetching one extra row lets us return hasMore without an extra query.
// The cursor is exclusive and stable even when old messages are deleted.
func (*ChatLog) GetHistory(room string, amount int, beforeID int) ([]DBChatMessage, bool, error) {
	rows, err := db.Query(context.Background(), `
		SELECT
			chat_log.id,
			chat_log.user_id,
			chat_log.source,
			COALESCE(users.username, 'Deleted user #' || chat_log.user_id::text),
			chat_log.discord_name,
			chat_log.message,
			chat_log.datetime_sent
		FROM chat_log
		LEFT JOIN users ON users.id = chat_log.user_id
		WHERE
			chat_log.room = $1
			AND chat_log.deleted_at IS NULL
			AND ($2 = 0 OR chat_log.id < $2)
		ORDER BY chat_log.id DESC
		LIMIT $3
	`, room, beforeID, amount+1)
	if err != nil {
		return nil, false, err
	}
	defer rows.Close()

	messages := make([]DBChatMessage, 0, amount+1)
	for rows.Next() {
		var message DBChatMessage
		var source string
		if err := rows.Scan(
			&message.ID,
			&message.UserID,
			&source,
			&message.Name,
			&message.DiscordName,
			&message.Message,
			&message.Datetime,
		); err != nil {
			return nil, false, err
		}
		message.Source = ChatLogSource(source)
		messages = append(messages, message)
	}
	if err := rows.Err(); err != nil {
		return nil, false, err
	}

	hasMore := len(messages) > amount
	if hasMore {
		messages = messages[:amount]
	}
	return messages, hasMore, nil
}
