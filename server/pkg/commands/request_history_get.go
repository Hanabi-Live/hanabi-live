package commands

import (
	"context"

	"github.com/Zamiell/hanabi-live/server/pkg/models"
	"github.com/Zamiell/hanabi-live/server/pkg/util"
)

// commandHistoryGet is sent when the user clicks the "Show More History" button
//
// Example data:
// {
//   offset: 10,
//   amount: 10,
// }
func commandHistoryGet(ctx context.Context, s *Session, d *CommandData) {
	// Validate that they sent a valid offset and amount value
	if d.Offset < 0 {
		s.Warning("That is not a valid start value.")
		return
	}
	if d.Amount < 0 {
		s.Warning("That is not a valid end value.")
		return
	}

	// Get the list of game IDs for the range that they specified
	var gameIDs []int
	if v, err := models.Games.GetGameIDsUser(s.UserID, d.Offset, d.Amount); err != nil {
		hLog.Errorf(
			"Failed to get the game IDs for %v: %v",
			util.PrintUser(s.UserID, s.Username),
			err,
		)
		s.Error(DefaultErrorMsg)
		return
	} else {
		gameIDs = v
	}

	// Get the history for these game IDs
	var gameHistoryList []*GameHistory
	if v, err := models.Games.GetHistory(gameIDs); err != nil {
		hLog.Errorf(
			"Failed to get the history for %v: %v",
			util.PrintUser(s.UserID, s.Username),
			err,
		)
		s.Error(DefaultErrorMsg)
		return
	} else {
		gameHistoryList = v
	}

	s.Emit("gameHistory", &gameHistoryList)
}
