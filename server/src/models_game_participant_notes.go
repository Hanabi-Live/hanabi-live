package main

import (
	"context"
)

type GameParticipantNotes struct{}

// GameParticipantNotesRow roughly mirrors the "game_participant_notes" table row
type GameParticipantNotesRow struct {
	GameID    int
	UserID    int
	CardOrder int
	Note      string
}

func (*GameParticipantNotes) BulkInsert(gameParticipantNotesRows []*GameParticipantNotesRow) error {
	SQLString := `
		INSERT INTO game_participant_notes (
			game_participant_id,
			card_order,
			note
		)
		VALUES %s
	`
	numArgsPerRow := 5
	valueArgs := make([]interface{}, 0, numArgsPerRow*len(gameParticipantNotesRows))
	for _, gameParticipantNotesRow := range gameParticipantNotesRows {
		valueArgs = append(
			valueArgs,
			gameParticipantNotesRow.GameID,
			gameParticipantNotesRow.UserID,
			gameParticipantNotesRow.CardOrder,
			gameParticipantNotesRow.Note,
		)
	}
	valueSQL := `
		(SELECT id FROM game_participants WHERE game_id = ? AND user_id = ?),
		?,
		?
	`
	SQLString = getBulkInsertSQL(SQLString, valueSQL, len(gameParticipantNotesRows))

	_, err := db.Exec(context.Background(), SQLString, valueArgs...)
	return err
}
