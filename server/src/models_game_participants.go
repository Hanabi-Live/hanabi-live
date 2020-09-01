package main

import (
	"context"
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
		VALUES %s
	`
	numArgsPerRow := 5
	valueArgs := make([]interface{}, 0, numArgsPerRow*len(gameParticipantsRows))
	for _, gameParticipantsRow := range gameParticipantsRows {
		valueArgs = append(
			valueArgs,
			gameParticipantsRow.GameID,
			gameParticipantsRow.UserID,
			gameParticipantsRow.Seat,
			gameParticipantsRow.CharacterAssignment,
			gameParticipantsRow.CharacterMetadata,
		)
	}
	SQLString = getBulkInsertSQLSimple(SQLString, numArgsPerRow, len(gameParticipantsRows))

	_, err := db.Exec(context.Background(), SQLString, valueArgs...)
	return err
}
