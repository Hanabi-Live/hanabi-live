package main

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

func httpMissingScores(c *gin.Context) {
	// Local variables
	w := c.Writer

	var user User
	if v, ok := httpParsePlayerName(c); !ok {
		return
	} else {
		user = v
	}

	// Parse the number of players from the URL
	numPlayersString := c.Param("numPlayers")
	numPlayers := 0
	if numPlayersString != "" {
		if v, err := strconv.Atoi(numPlayersString); err == nil {
			numPlayers = v
		}
	}

	// Get all of the variant-specific stats for this player
	var statsMap map[int]*UserStatsRow
	if v, err := models.UserStats.GetAll(user.ID); err != nil {
		logger.Error("Failed to get all of the variant-specific stats for player "+
			"\""+user.Username+"\":", err)
		http.Error(
			w,
			http.StatusText(http.StatusInternalServerError),
			http.StatusInternalServerError,
		)
		return
	} else {
		statsMap = v
	}

	numMaxScores, numMaxScoresPerType, variantStatsList := httpGetVariantStatsList(statsMap)
	percentageMaxScoresString, percentageMaxScoresPerType := httpGetPercentageMaxScores(
		numMaxScores,
		numMaxScoresPerType,
	)

	data := TemplateData{
		Title:                      "Missing Scores",
		Name:                       user.Username,
		RequestedNumPlayers:        numPlayers,
		NumMaxScores:               numMaxScores,
		PercentageMaxScores:        percentageMaxScoresString,
		NumMaxScoresPerType:        numMaxScoresPerType,
		PercentageMaxScoresPerType: percentageMaxScoresPerType,
		SharedMissingScores:        false,

		VariantStats: variantStatsList,
	}
	httpServeTemplate(w, data, "profile", "missing-scores")
}
