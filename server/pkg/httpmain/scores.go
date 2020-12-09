package httpmain

import (
	"fmt"
	"net/http"

	"github.com/Zamiell/hanabi-live/server/pkg/models"
	"github.com/Zamiell/hanabi-live/server/pkg/util"
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

func scores(c *gin.Context) {
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
		hLog.Errorf(
			"Failed to get the profile stats for %v: %v",
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
	dateFormatString := fmt.Sprintf("January 2%v, 2006", suffix)
	dateJoined := profileStats.DateJoined.Format(dateFormatString)

	// Only show their normal time if they have played one or more non-speedrun games
	timePlayed := ""
	if profileStats.TimePlayed != 0 {
		if v, err := secondsToDurationString(profileStats.TimePlayed); err != nil {
			hLog.Errorf("Failed to parse the duration of \"%v\" for %v: %v",
				profileStats.TimePlayed,
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
			timePlayed = v
		}
	}

	// Only show their speedrun time if they have played one or more speedrun games
	timePlayedSpeedrun := ""
	if profileStats.TimePlayedSpeedrun != 0 {
		if v, err := secondsToDurationString(profileStats.TimePlayedSpeedrun); err != nil {
			hLog.Errorf(
				"Failed to parse the duration of \"%v\" for %v: %v",
				profileStats.TimePlayedSpeedrun,
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
			timePlayedSpeedrun = v
		}
	}

	// Get all of the variant-specific stats for this player
	var statsMap map[int]*UserStatsRow
	if v, err := models.UserStats.GetAll(user.ID); err != nil {
		hLog.Errorf(
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

	numMaxScores, numMaxScoresPerType, variantStatsList := httpGetVariantStatsList(statsMap)
	percentageMaxScoresString, percentageMaxScoresPerType := httpGetPercentageMaxScores(
		numMaxScores,
		numMaxScoresPerType,
	)

	data := &TemplateData{ // nolint: exhaustivestruct
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
