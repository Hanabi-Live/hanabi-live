package main

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

type UserVariantStats struct {
	ID            int
	Name          string
	NumGames      int
	MaxScore      int
	BestScores    []*BestScore
	AverageScore  string
	NumStrikeouts int
	StrikeoutRate string
}

func httpScores(c *gin.Context) {
	// Local variables
	w := c.Writer

	var user User
	if v, ok := httpParsePlayerName(c); !ok {
		return
	} else {
		user = v
	}

	// Get basic stats for this player
	var profileStats Stats
	if v, err := models.Games.GetProfileStats(user.ID); err != nil {
		logger.Error("Failed to get the profile stats for player \""+user.Username+"\":", err)
		http.Error(
			w,
			http.StatusText(http.StatusInternalServerError),
			http.StatusInternalServerError,
		)
		return
	} else {
		profileStats = v
	}

	// Format the date that they joined
	// https://stackoverflow.com/questions/28889818/formatting-verbose-dates-in-go
	suffix := "th"
	switch profileStats.DateJoined.Day() {
	case 1, 21, 31:
		suffix = "st"
	case 2, 22:
		suffix = "nd"
	case 3, 23:
		suffix = "rd"
	}
	dateJoined := profileStats.DateJoined.Format("January 2" + suffix + ", 2006")

	// Only show their normal time if they have played one or more non-speedrun games
	timePlayed := ""
	if profileStats.TimePlayed != 0 {
		if v, err := secondsToDurationString(profileStats.TimePlayed); err != nil {
			logger.Error("Failed to parse the duration of "+
				"\""+strconv.Itoa(profileStats.TimePlayed)+"\" for player "+
				"\""+user.Username+"\":", err)
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

	// Only show their speedrun time if they have played one or more speedrun games
	timePlayedSpeedrun := ""
	if profileStats.TimePlayedSpeedrun != 0 {
		if v, err := secondsToDurationString(profileStats.TimePlayedSpeedrun); err != nil {
			logger.Error("Failed to parse the duration of "+
				"\""+strconv.Itoa(profileStats.TimePlayedSpeedrun)+"\" for player "+
				"\""+user.Username+"\":", err)
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
		Title:                      "Scores",
		Name:                       user.Username,
		DateJoined:                 dateJoined,
		NumGames:                   profileStats.NumGames,
		TimePlayed:                 timePlayed,
		NumGamesSpeedrun:           profileStats.NumGamesSpeedrun,
		TimePlayedSpeedrun:         timePlayedSpeedrun,
		NumMaxScores:               numMaxScores,
		TotalMaxScores:             len(variantNames) * 5, // For 2 to 6 players
		PercentageMaxScores:        percentageMaxScoresString,
		NumMaxScoresPerType:        numMaxScoresPerType,
		PercentageMaxScoresPerType: percentageMaxScoresPerType,

		VariantStats: variantStatsList,
	}
	httpServeTemplate(w, data, "profile", "scores")
}
