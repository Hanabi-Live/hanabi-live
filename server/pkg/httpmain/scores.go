package httpmain

import (
	"net/http"

	"github.com/Zamiell/hanabi-live/server/pkg/bestscore"
	"github.com/Zamiell/hanabi-live/server/pkg/models"
	"github.com/Zamiell/hanabi-live/server/pkg/util"
	"github.com/gin-gonic/gin"
)

type UserVariantStats struct {
	ID            int
	Name          string
	NumGames      int
	MaxScore      int
	BestScores    []*bestscore.BestScore
	AverageScore  string
	NumStrikeouts int
	StrikeoutRate string
}

func (m *Manager) scores(c *gin.Context) {
	// Local variables
	w := c.Writer

	var user *models.User
	if v, ok := m.parsePlayerName(c); !ok {
		return
	} else {
		user = v
	}

	// Get basic stats for this player
	var profileStats models.Stats
	if v, err := m.models.Games.GetProfileStats(c, user.ID); err != nil {
		m.logger.Errorf(
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

	dateJoined := formatDate(profileStats.DateJoined)

	// Only show their normal time if they have played one or more non-speedrun games
	timePlayed := ""
	if profileStats.TimePlayed != 0 {
		if v, err := util.SecondsToDurationString(profileStats.TimePlayed); err != nil {
			m.logger.Errorf("Failed to parse the duration of \"%v\" for %v: %v",
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
		if v, err := util.SecondsToDurationString(profileStats.TimePlayedSpeedrun); err != nil {
			m.logger.Errorf(
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
	var statsMap map[int]*models.UserStatsRow
	if v, err := m.models.UserStats.GetAll(c, user.ID); err != nil {
		m.logger.Errorf(
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

	numMaxScores, numMaxScoresPerType, variantStatsList := m.getVariantStatsList(statsMap)
	percentageMaxScoresString, percentageMaxScoresPerType := m.getPercentageMaxScores(
		numMaxScores,
		numMaxScoresPerType,
	)
	totalMaxScores := m.Dispatcher.Variants.GetNumVariants() * bestscore.NumPlayerGameTypes

	type scoresData struct {
		Title                      string
		Name                       string
		DateJoined                 string
		NumGames                   int
		TimePlayed                 string
		NumGamesSpeedrun           int
		TimePlayedSpeedrun         string
		NumMaxScores               int
		TotalMaxScores             int
		PercentageMaxScores        string
		NumMaxScoresPerType        []int
		PercentageMaxScoresPerType []string
		VariantStats               []*UserVariantStats
		Common                     *commonData
	}
	data := &scoresData{
		Title:                      "Scores",
		Name:                       user.Username,
		DateJoined:                 dateJoined,
		NumGames:                   profileStats.NumGames,
		TimePlayed:                 timePlayed,
		NumGamesSpeedrun:           profileStats.NumGamesSpeedrun,
		TimePlayedSpeedrun:         timePlayedSpeedrun,
		NumMaxScores:               numMaxScores,
		TotalMaxScores:             totalMaxScores,
		PercentageMaxScores:        percentageMaxScoresString,
		NumMaxScoresPerType:        numMaxScoresPerType,
		PercentageMaxScoresPerType: percentageMaxScoresPerType,
		VariantStats:               variantStatsList,
		Common:                     m.getCommonData(),
	}
	m.serveTemplate(w, data, "profile", "scores")
}
