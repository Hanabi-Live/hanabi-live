package main

import (
	"context"
	"time"
)

type ChatLogPM struct{}

type ChatLogPMInsertResult struct {
	ID           int
	DatetimeSent time.Time
}

type ChatLogPMHistoryMessage struct {
	PMID      int       `json:"pmID"`
	Msg       string    `json:"msg"`
	Who       string    `json:"who"`
	Recipient string    `json:"recipient"`
	Datetime  time.Time `json:"datetime"`
}

func (*ChatLogPM) Insert(
	userID int,
	message string,
	recipientID int,
) (ChatLogPMInsertResult, error) {
	var result ChatLogPMInsertResult
	err := db.QueryRow(context.Background(), `
		INSERT INTO chat_log_pm (user_id, recipient_id, message)
		VALUES ($1, $2, $3)
		RETURNING id, datetime_sent
	`, userID, recipientID, message).Scan(
		&result.ID,
		&result.DatetimeSent,
	)
	return result, err
}

func (*ChatLogPM) GetHistory(
	userID int,
	amount int,
	beforeID int,
	peerID int,
) ([]ChatLogPMHistoryMessage, bool, error) {
	rows, err := db.Query(context.Background(), `
		SELECT
			pm.id,
			pm.message,
			pm.datetime_sent,
			COALESCE(sender.username, 'Deleted user #' || pm.user_id::text),
			COALESCE(recipient.username, 'Deleted user #' || pm.recipient_id::text)
		FROM chat_log_pm AS pm
		LEFT JOIN users AS sender
			ON sender.id = pm.user_id
		LEFT JOIN users AS recipient
			ON recipient.id = pm.recipient_id
		WHERE
			(pm.user_id = $1 OR pm.recipient_id = $1)
			AND ($2 = 0 OR pm.id < $2)
			AND (
				$3 = 0
				OR (pm.user_id = $1 AND pm.recipient_id = $3)
				OR (pm.user_id = $3 AND pm.recipient_id = $1)
			)
		ORDER BY pm.id DESC
		LIMIT $4
	`, userID, beforeID, peerID, amount+1)
	if err != nil {
		return nil, false, err
	}
	defer rows.Close()

	messages := make([]ChatLogPMHistoryMessage, 0, amount+1)
	for rows.Next() {
		var message ChatLogPMHistoryMessage
		if err := rows.Scan(
			&message.PMID,
			&message.Msg,
			&message.Datetime,
			&message.Who,
			&message.Recipient,
		); err != nil {
			return nil, false, err
		}
		messages = append(messages, message)
	}
	if err := rows.Err(); err != nil {
		return nil, false, err
	}

	hasMore := len(messages) > amount
	if hasMore {
		messages = messages[:amount]
	}

	for i, j := 0, len(messages)-1; i < j; i, j = i+1, j-1 {
		messages[i], messages[j] = messages[j], messages[i]
	}

	return messages, hasMore, nil
}
