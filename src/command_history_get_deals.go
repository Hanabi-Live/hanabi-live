package main

import (
	"strconv"
)

// commandHistoryGetDeals is sent when the user clicks on the "Compare Scores" button
//
// Example data:
// {
//   gameID: 15103,
// }
func commandHistoryGetDeals(s *Session, d *CommandData) {
	var gameHistoryList []*GameHistory
	if v, err := models.Games.GetAllDealsFromGameID(d.GameID); err != nil {
		logger.Error("Failed to get the deals from the database for game "+
			strconv.Itoa(d.GameID)+":", err)
		s.Error("Failed to get the deals for game " + strconv.Itoa(d.GameID) + ". " +
			"Please contact an administrator.")
		return
	} else {
		gameHistoryList = v
	}

	type GameHistoryOtherScoresMessage struct {
		Games   []*GameHistory `json:"games"`
		Friends bool           `json:"friends"`
	}
	s.Emit("gameHistoryOtherScores", &GameHistoryOtherScoresMessage{
		Games:   gameHistoryList,
		Friends: d.Friends,
	})
}
