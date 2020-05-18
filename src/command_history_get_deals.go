package main

import (
	"strconv"
	"time"
)

// commandHistoryGetDeals is sent when the user clicks on the "Compare Scores" button
//
// Example data:
// {
//   gameID: 15103,
// }
func commandHistoryGetDeals(s *Session, d *CommandData) {
	var historyListDatabase []*GameHistory
	if v, err := models.Games.GetAllDealsFromGameID(d.GameID); err != nil {
		logger.Error("Failed to get the deals from the database for game "+
			strconv.Itoa(d.GameID)+":", err)
		s.Error("Failed to get the deals for game " + strconv.Itoa(d.GameID) + ". " +
			"Please contact an administrator.")
		return
	} else {
		historyListDatabase = v
	}
	historyListDatabase = historyFillVariants(historyListDatabase)

	type GameHistoryOtherScoresMessage struct {
		ID          int       `json:"id"`
		Score       int       `json:"score"`
		PlayerNames string    `json:"playerNames"`
		Datetime    time.Time `json:"datetime"`
		Seed        string    `json:"seed"`
	}
	historyList := make([]*GameHistoryOtherScoresMessage, 0)
	for _, g := range historyListDatabase {
		historyList = append(historyList, &GameHistoryOtherScoresMessage{
			ID:          g.ID,
			Score:       g.Score,
			PlayerNames: g.PlayerNames,
			Datetime:    g.DatetimeFinished,
			Seed:        g.Seed,
		})
	}
	s.Emit("gameHistoryOtherScores", &historyList)
}
