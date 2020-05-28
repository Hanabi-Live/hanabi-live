package main

import (
	"net/http"

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

	var gameHistoryList []*GameHistory
	if v, err := models.Games.GetAllDealsFromSeed(seed); err != nil {
		logger.Error("Failed to get the deals from the database for seed \""+seed+"\":", err)
		http.Error(
			w,
			http.StatusText(http.StatusInternalServerError),
			http.StatusInternalServerError,
		)
		return
	} else {
		gameHistoryList = v
	}

	c.JSON(http.StatusOK, gameHistoryList)
}
