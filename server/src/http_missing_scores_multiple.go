package main

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

func httpMissingScoresMultiple(c *gin.Context) {
	// Local variables
	w := c.Writer

	// Parse the player name(s) from the URL
	var playerIDs []int
	var playerNames []string
	if v1, v2, ok := httpParsePlayerNames(c); !ok {
		return
	} else {
		playerIDs = v1
		playerNames = v2
	}

	var numMaxScores int
	var numMaxScoresPerType []int
	var variantStatsList []UserVariantStats
	var percentageMaxScoresString string
	var percentageMaxScoresPerType []string
	for i, playerID := range playerIDs {
		// Get all of the variant-specific stats for this player
		var statsMap map[int]UserStatsRow
		if v, err := models.UserStats.GetAll(playerID); err != nil {
			logger.Error("Failed to get all of the variant-specific stats for player "+
				"\""+playerNames[i]+"\":", err)
			http.Error(
				w,
				http.StatusText(http.StatusInternalServerError),
				http.StatusInternalServerError,
			)
			return
		} else {
			statsMap = v
		}

		numMaxScores, numMaxScoresPerType, variantStatsList = httpGetVariantStatsList(statsMap)
		percentageMaxScoresString, percentageMaxScoresPerType = httpGetPercentageMaxScores(
			numMaxScores,
			numMaxScoresPerType,
		)
	}

	data := ProfileData{
		Title:                      "Missing Scores",
		Name:                       playerNames[0],
		NumMaxScores:               numMaxScores,
		PercentageMaxScores:        percentageMaxScoresString,
		NumMaxScoresPerType:        numMaxScoresPerType,
		PercentageMaxScoresPerType: percentageMaxScoresPerType,

		VariantStats: variantStatsList,
	}
	httpServeTemplate(w, data, "profile", "missing-scores")
}
