package main

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

func httpSharedMissingScores(c *gin.Context) {
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

	if len(playerIDs) < 2 {
		http.Error(w, "Error: You must specify at least two players.", http.StatusNotFound)
		return
	}

	// Get all of the variant-specific stats for each player
	variantStatsListList := make([][]*UserVariantStats, 0)
	for i, playerID := range playerIDs {
		var statsMap map[int]*UserStatsRow
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

		_, _, variantStatsList := httpGetVariantStatsList(statsMap)
		variantStatsListList = append(variantStatsListList, variantStatsList)
	}

	// Make a combined list that always uses the maximum score from any player
	// Start by copying the list for the 0th player
	combinedVariantStatsList := variantStatsListList[0]
	for i, variantStatsList := range variantStatsListList {
		if i == 0 {
			// We skip the 0th list because this is the one that we are using as a baseline
			continue
		}
		for j, variantStats := range variantStatsList {
			for k, candidateResult := range variantStats.BestScores {
				workingBestResult := combinedVariantStatsList[j].BestScores[k]
				if candidateResult.IsBetterThan(workingBestResult) {
					combinedVariantStatsList[j].BestScores[k] = candidateResult
				}
			}
		}
	}

	data := TemplateData{
		Title:               "Missing Scores",
		NamesTitle:          "Missing Scores for [" + strings.Join(playerNames, ", ") + "]",
		RequestedNumPlayers: len(playerIDs),
		SharedMissingScores: true,

		VariantStats: combinedVariantStatsList,
	}
	httpServeTemplate(w, data, "profile", "missing-scores")
}
