package httpmain

import (
	"fmt"
	"net/http"

	"github.com/Zamiell/hanabi-live/server/pkg/models"
	"github.com/gin-gonic/gin"
)

func seed(c *gin.Context) {
	// Local variables
	w := c.Writer

	// Parse the seed from the URL
	seed := c.Param("seed")
	if seed == "" {
		http.Error(w, "Error: You must specify a seed.", http.StatusNotFound)
		return
	}

	// Get the list of game IDs played on this seed
	var gameIDs []int
	if v, err := hModels.Games.GetGameIDsSeed(c, seed); err != nil {
		hLogger.Errorf("Failed to get the game IDs from the database for seed \"%v\": %v", seed, err)
		http.Error(
			w,
			http.StatusText(http.StatusInternalServerError),
			http.StatusInternalServerError,
		)
		return
	} else {
		gameIDs = v
	}

	// Get the history for these game IDs
	// (with a custom sort by score)
	var gameHistoryList []*models.GameHistory
	if v, err := hModels.Games.GetHistoryCustomSort(c, gameIDs, "seed"); err != nil {
		hLogger.Errorf("Failed to get the history: %v", err)
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

	data := &TemplateData{ // nolint: exhaustivestruct
		Title:        "History",
		History:      gameHistoryList,
		NamesTitle:   fmt.Sprintf("seed: %v", seed),
		SpecificSeed: true,
	}
	serveTemplate(w, data, "profile", "history")
}
