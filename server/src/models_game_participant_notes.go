package main

import (
	"context"
	"strconv"
	"strings"
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
		VALUES
	`
	for _, gameParticipantNotesRow := range gameParticipantNotesRows {
		SQLString += "(" +
			"(SELECT id FROM game_participants " +
			"WHERE game_id = " + strconv.Itoa(gameParticipantNotesRow.GameID) + " " +
			"AND user_id = " + strconv.Itoa(gameParticipantNotesRow.UserID) + "), " +
			strconv.Itoa(gameParticipantNotesRow.CardOrder) + ", " +
			"'" + gameParticipantNotesRow.Note + "'" +
			"), "
	}
	SQLString = strings.TrimSuffix(SQLString, ", ")

	_, err := db.Exec(context.Background(), SQLString)
	return err
}
