/*
	Sent when the user clicks on the "Compare Scores" button
	"data" example:
	{
		gameID: 15103,
	}
*/

package main

import (
	"strconv"
	"time"
)

func commandHistoryGetDeals(s *Session, d *CommandData) {
	gameID := d.GameID
	var historyListDatabase []*GameHistory
	if v, err := models.Games.GetAllDeals(s.UserID(), gameID); err != nil {
		logger.Error("Failed to get the deals from the database for game "+strconv.Itoa(gameID)+":", err)
		s.Error("Failed to get the deals for game " + strconv.Itoa(gameID) + ". Please contact an administrator.")
		return
	} else {
		historyListDatabase = v
	}
	historyListDatabase = historyFillVariants(historyListDatabase)

	type GameHistoryOtherScoresMessage struct {
		ID               int       `json:"id"`
		OtherPlayerNames string    `json:"otherPlayerNames"`
		Score            int       `json:"score"`
		Datetime         time.Time `json:"datetime"`
		You              bool      `json:"you"`
	}
	historyList := make([]*GameHistoryOtherScoresMessage, 0)
	for _, g := range historyListDatabase {
		historyList = append(historyList, &GameHistoryOtherScoresMessage{
			ID:               g.ID,
			OtherPlayerNames: g.OtherPlayerNames, // The SQL query calculates these
			Score:            g.Score,
			Datetime:         g.DatetimeFinished,
			You:              g.You,
		})
	}
	s.Emit("gameHistoryOtherScores", &historyList)
}
