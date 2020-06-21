package main

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

func httpSeed(c *gin.Context) {
	// Local variables
	w := c.Writer

	// Parse the seed from the URL
	seed := c.Param("seed")
	if seed == "" {
		http.Error(w, "Error: You must specify a seed.", http.StatusNotFound)
		return
	}

	// Get all games played on this seed
	var gameIDs []int
	if v, err := models.Games.GetGameIDsSeed(seed); err != nil {
		logger.Error("Failed to get the game IDs from the database for seed \""+seed+"\":", err)
		http.Error(
			w,
			http.StatusText(http.StatusInternalServerError),
			http.StatusInternalServerError,
		)
		return
	} else {
		gameIDs = v
	}

	// Get the games corresponding to these IDs
	var gameHistoryList []*GameHistory
	if v, err := models.Games.GetHistory(gameIDs); err != nil {
		logger.Error("Failed to get the games from the database:", err)
		http.Error(
			w,
			http.StatusText(http.StatusInternalServerError),
			http.StatusInternalServerError,
		)
		return
	} else {
		gameHistoryList = v
	}

	if _, ok := c.Request.URL.Query()["api"]; ok {
		c.JSON(http.StatusOK, gameHistoryList)
		return
	}

	data := HistoryData{
		Title:        "History",
		History:      gameHistoryList,
		NamesTitle:   "seed: " + seed,
		SpecificSeed: true,
	}
	httpServeTemplate(w, data, "profile", "history")
}
