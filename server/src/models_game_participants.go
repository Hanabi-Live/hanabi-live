package main

import (
	"context"
	"strconv"
	"strings"
)

type GameParticipants struct{}

// GameParticipantsRow mirrors the "game_participants" table row
type GameParticipantsRow struct {
	GameID              int
	UserID              int
	Seat                int
	CharacterAssignment int
	CharacterMetadata   int
}

func (*GameParticipants) BulkInsert(gameParticipantsRows []*GameParticipantsRow) error {
	SQLString := `
		INSERT INTO game_participants (
			game_id,
			user_id,
			seat,
			character_assignment,
			character_metadata
		)
		VALUES
	`
	for _, gameParticipantsRow := range gameParticipantsRows {
		SQLString += "(" +
			strconv.Itoa(gameParticipantsRow.GameID) + ", " +
			strconv.Itoa(gameParticipantsRow.UserID) + ", " +
			strconv.Itoa(gameParticipantsRow.Seat) + ", " +
			strconv.Itoa(gameParticipantsRow.CharacterAssignment) + ", " +
			strconv.Itoa(gameParticipantsRow.CharacterMetadata) +
			"), "
	}
	SQLString = strings.TrimSuffix(SQLString, ", ")

	_, err := db.Exec(context.Background(), SQLString)
	return err
}
