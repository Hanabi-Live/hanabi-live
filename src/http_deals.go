package main

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

func httpDeals(c *gin.Context) {
	// Local variables
	w := c.Writer

	// Parse the seed from the URL
	seed := c.Param("seed")
	if seed == "" {
		http.Error(w, "Error: You must specify the seed.", http.StatusNotFound)
		return
	}

	var historyListDatabase []*GameHistory
	if v, err := models.Games.GetAllDealsFromSeed(seed); err != nil {
		logger.Error("Failed to get the deals from the database for seed \""+seed+"\":", err)
		http.Error(
			w,
			http.StatusText(http.StatusInternalServerError),
			http.StatusInternalServerError,
		)
		return
	} else {
		historyListDatabase = v
	}

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

	c.JSON(http.StatusOK, historyList)
}
