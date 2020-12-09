package httpmain

import (
	"net/http"
	"strconv"

	"github.com/Zamiell/hanabi-live/server/pkg/models"
	"github.com/Zamiell/hanabi-live/server/pkg/util"
	"github.com/gin-gonic/gin"
)

func missingScores(c *gin.Context) {
	// Local variables
	w := c.Writer

	var user models.User
	if v, ok := parsePlayerName(c); !ok {
		return
	} else {
		user = v
	}

	// Parse the number of players from the URL
	numPlayersString := c.Param("numPlayers")
	numPlayers := 0
	if numPlayersString != "" {
		if v, err := strconv.Atoi(numPlayersString); err != nil {
			http.Error(w, "Error: The number of players must be an integer.", http.StatusBadRequest)
			return
		} else {
			numPlayers = v
		}
	}

	// Get all of the variant-specific stats for this player
	var statsMap map[int]*models.UserStatsRow
	if v, err := hModels.UserStats.GetAll(c, user.ID); err != nil {
		hLogger.Errorf(
			"Failed to get all of the variant-specific stats for %v: %v",
			util.PrintUser(user.ID, user.Username),
			err,
		)
		http.Error(
			w,
			http.StatusText(http.StatusInternalServerError),
			http.StatusInternalServerError,
		)
		return
	} else {
		statsMap = v
	}

	numMaxScores, numMaxScoresPerType, variantStatsList := getVariantStatsList(statsMap)
	percentageMaxScoresString, percentageMaxScoresPerType := getPercentageMaxScores(
		numMaxScores,
		numMaxScoresPerType,
	)

	data := &TemplateData{ // nolint: exhaustivestruct
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
	serveTemplate(w, data, "profile", "missing-scores")
}
