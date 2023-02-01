package main

import (
	"net/http"

	"github.com/Hanabi-Live/hanabi-live/logger"
	"github.com/gin-gonic/gin"
)

func httpSeed(c *gin.Context) {
	// Parse the seed from the URL
	seed := c.Param("seed")
	if seed == "" {
		http.Error(c.Writer, "Error: You must specify a seed.", http.StatusNotFound)
		return
	}

	seedScoreFreqs := make([]*ScoreFreq, 0)
	if v, err := models.Seeds.GetScoreFreqs(seed); err != nil {
		logger.Error("Failed to get the seed stats for " + seed  + err.Error())
		http.Error(
			c.Writer,
			http.StatusText(http.StatusInternalServerError),
			http.StatusInternalServerError,
		)
		return
	} else {
		seedScoreFreqs = v
	}

	data := &TemplateData{ // nolint: exhaustivestruct
		Title:        "History",
		NamesTitle:   "seed: " + seed,
		Seed:         seed,
		SpecificSeed: true,
		ScoreFreqs:   seedScoreFreqs,
	}

	httpServeTemplate(c.Writer, data, "players_history", "history")
}
