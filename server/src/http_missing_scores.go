package main

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

func httpMissingScores(c *gin.Context) {
	// Local variables
	w := c.Writer

	/*
		// Parse the player name(s) from the URL
		var playerIDs []int
		var playerNames []string
		if v1, v2, ok := httpParsePlayerNames(c); !ok {
			return
		} else {
			playerIDs = v1
			playerNames = v2
		}
	*/

	// Parse the player name from the URL
	player := c.Param("player")
	if player == "" {
		http.Error(w, "Error: You must specify a player.", http.StatusNotFound)
		return
	}
	normalizedUsername := normalizeString(player)

	// Check if the player exists
	var user User
	if exists, v, err := models.Users.GetUserFromNormalizedUsername(
		normalizedUsername,
	); err != nil {
		logger.Error("Failed to check to see if player \""+player+"\" exists:", err)
		http.Error(
			w,
			http.StatusText(http.StatusInternalServerError),
			http.StatusInternalServerError,
		)
		return
	} else if exists {
		user = v
	} else {
		http.Error(w, "Error: That player does not exist in the database.", http.StatusNotFound)
		return
	}

	// Get all of the variant-specific stats for this player
	var statsMap map[int]UserStatsRow
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

	data := ProfileData{
		Title:                      "Missing Scores",
		Name:                       user.Username,
		NumMaxScores:               numMaxScores,
		PercentageMaxScores:        percentageMaxScoresString,
		NumMaxScoresPerType:        numMaxScoresPerType,
		PercentageMaxScoresPerType: percentageMaxScoresPerType,

		VariantStats: variantStatsList,
	}
	httpServeTemplate(w, data, "profile", "missing-scores")
}
