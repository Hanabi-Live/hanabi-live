package main

import (
	"net/http"
	"strconv"

	"github.com/Hanabi-Live/hanabi-live/logger"
	"github.com/gin-gonic/gin"
)

func httpStats(c *gin.Context) {
	// Local variables
	w := c.Writer

	// Get some global statistics
	var globalStats Stats
	if v, err := models.Games.GetGlobalStats(); err != nil {
		logger.Error("Failed to get the global stats: " + err.Error())
		http.Error(
			w,
			http.StatusText(http.StatusInternalServerError),
			http.StatusInternalServerError,
		)
		return
	} else {
		globalStats = v
	}

	// It will only be valid if they have played a non-speedrun game
	timePlayed := ""
	if globalStats.TimePlayed != 0 {
		if v, err := secondsToDurationString(globalStats.TimePlayed); err != nil {
			logger.Error("Failed to parse the duration of " +
				"\"" + strconv.Itoa(globalStats.TimePlayed) + "\" for the global stats: " +
				err.Error())
			http.Error(
				w,
				http.StatusText(http.StatusInternalServerError),
				http.StatusInternalServerError,
			)
			return
		} else {
			timePlayed = v
		}
	}

	// It will only be valid if they have played a speedrun game
	timePlayedSpeedrun := ""
	if globalStats.TimePlayedSpeedrun != 0 {
		if v, err := secondsToDurationString(globalStats.TimePlayedSpeedrun); err != nil {
			logger.Error("Failed to parse the duration of " +
				"\"" + strconv.Itoa(globalStats.TimePlayedSpeedrun) + "\" for the global stats: " +
				err.Error())
			http.Error(
				w,
				http.StatusText(http.StatusInternalServerError),
				http.StatusInternalServerError,
			)
			return
		} else {
			timePlayedSpeedrun = v
		}
	}

	data := &TemplateData{ // nolint: exhaustivestruct
		Title: "Stats",

		NumGamesTotal:      globalStats.NumGamesNormal + globalStats.NumGamesOther,
		NumGamesNormal:     globalStats.NumGamesNormal,
		NumGamesOther:      globalStats.NumGamesOther,
		TimePlayed:         timePlayed,
		NumGamesSpeedrun:   globalStats.NumGamesSpeedrun,
		TimePlayedSpeedrun: timePlayedSpeedrun,
	}

	httpServeTemplate(w, data, "stats")
}
