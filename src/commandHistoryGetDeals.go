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

	"github.com/Zamiell/hanabi-live/src/models"
)

func commandHistoryGetDeals(s *Session, d *CommandData) {
	gameID := d.GameID
	var deals []models.GameHistory
	if v, err := db.Games.GetAllDeals(s.UserID(), gameID); err != nil {
		log.Error("Failed to get the deals from the database for game "+strconv.Itoa(gameID)+":", err)
		s.Error("Failed to get the deals for game " + strconv.Itoa(gameID) + ". Please contact an administrator.")
		return
	} else {
		deals = v
	}

	for _, deal := range deals {
		type HistoryDealMessage struct {
			ID               int       `json:"id"`
			OtherPlayerNames string    `json:"otherPlayerNames"`
			Score            int       `json:"score"`
			Datetime         time.Time `json:"datetime"`
			You              bool      `json:"you"`
		}
		s.Emit("historyDeal", &HistoryDealMessage{
			ID:               deal.ID,
			OtherPlayerNames: deal.OtherPlayerNames, // The SQL query calculates these
			Score:            deal.Score,
			Datetime:         deal.DatetimeFinished,
			You:              deal.You,
		})
	}
}
