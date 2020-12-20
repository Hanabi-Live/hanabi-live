package httpmain

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/Zamiell/hanabi-live/server/pkg/models"
	"github.com/Zamiell/hanabi-live/server/pkg/util"
	"github.com/Zamiell/hanabi-live/server/pkg/variants"
	"github.com/gin-gonic/gin"
)

func (m *Manager) variant(c *gin.Context) {
	// Local variables
	w := c.Writer

	// Parse the variant ID from the URL
	variantIDstring := c.Param("id")
	if variantIDstring == "" {
		http.Error(w, "Error: You must specify a variant ID.", http.StatusNotFound)
		return
	}

	// Validate that it is an integer
	var variantID int
	if v, err := strconv.Atoi(variantIDstring); err != nil {
		http.Error(w, "Error: The variant ID must be an integer.", http.StatusBadRequest)
		return
	} else {
		variantID = v
	}

	// Validate that it is a valid variant ID
	var variantObject *variants.Variant
	if v, err := m.Dispatcher.Variants.GetVariantByID(variantID); err != nil {
		http.Error(w, "Error: That is not a valid variant ID.", http.StatusBadRequest)
		return
	} else {
		variantObject = v
	}

	// Get the stats for this variant
	var variantStats models.VariantStatsRow
	if v, err := m.models.VariantStats.Get(c, variantID); err != nil {
		m.logger.Errorf("Failed to get the variant stats for variant %v: %v", variantID, err)
		http.Error(
			w,
			http.StatusText(http.StatusInternalServerError),
			http.StatusInternalServerError,
		)
		return
	} else {
		variantStats = v
	}

	bestScores := make([]int, 0)
	for _, bestScore := range variantStats.BestScores {
		bestScores = append(bestScores, bestScore.Score)
	}
	maxScoreRateFloat := float64(variantStats.NumMaxScores) / float64(variantStats.NumGames) * 100   // nolint: gomnd
	strikeoutRateFloat := float64(variantStats.NumStrikeouts) / float64(variantStats.NumGames) * 100 // nolint: gomnd

	// Round them to 1 decimal place
	maxScoreRate := fmt.Sprintf("%.1f", maxScoreRateFloat)
	strikeoutRate := fmt.Sprintf("%.1f", strikeoutRateFloat)
	averageScore := fmt.Sprintf("%.1f", variantStats.AverageScore)

	// If it ends in ".0", remove the unnecessary digits
	maxScoreRate = strings.TrimSuffix(maxScoreRate, ".0")
	strikeoutRate = strings.TrimSuffix(strikeoutRate, ".0")
	if averageScore == zeroString {
		averageScore = "-"
	}

	// Get additional stats (that are not part of the "variant_stats" table)
	var stats models.Stats
	if v, err := m.models.Games.GetVariantStats(c, variantID); err != nil {
		m.logger.Errorf("Failed to get the stats for variant %v: %v", variantID, err)
		http.Error(
			w,
			http.StatusText(http.StatusInternalServerError),
			http.StatusInternalServerError,
		)
		return
	} else {
		stats = v
	}

	// It will only be valid if someone has played a non-speedrun game in this variant
	timePlayed := ""
	if stats.TimePlayed != 0 {
		if v, err := util.SecondsToDurationString(stats.TimePlayed); err != nil {
			m.logger.Errorf(
				"Failed to parse the duration of \"%v\" for the variant stats: %v",
				stats.TimePlayed,
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

	// It will only be valid if someone has played a speedrun game in this variant
	timePlayedSpeedrun := ""
	if stats.TimePlayedSpeedrun != 0 {
		if v, err := util.SecondsToDurationString(stats.TimePlayedSpeedrun); err != nil {
			m.logger.Errorf(
				"Failed to parse the duration of \"%v\" for the variant stats: %v",
				stats.TimePlayedSpeedrun,
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

	// Get recent games played on this variant
	var gameIDs []int
	if v, err := m.models.Games.GetGameIDsVariant(c, variantID, 50); err != nil {
		m.logger.Errorf("Failed to get the game IDs for variant %v: %v", variantID, err)
		http.Error(
			w,
			http.StatusText(http.StatusInternalServerError),
			http.StatusInternalServerError,
		)
		return
	} else {
		gameIDs = v
	}

	// Get the games corresponding to these IDs
	var gameHistoryList []*models.GameHistory
	if v, err := m.models.Games.GetHistory(c, gameIDs); err != nil {
		m.logger.Errorf("Failed to get the games from the database: %v", err)
		http.Error(
			w,
			http.StatusText(http.StatusInternalServerError),
			http.StatusInternalServerError,
		)
		return
	} else {
		gameHistoryList = v
	}

	type variantData struct {
		Title              string
		Name               string
		NumGames           int
		TimePlayed         string
		NumGamesSpeedrun   int
		TimePlayedSpeedrun string
		BestScores         []int
		AverageScore       string
		NumMaxScores       int
		MaxScoreRate       string
		MaxScore           int
		NumStrikeouts      int
		StrikeoutRate      string
		RecentGames        []*models.GameHistory
		Common             *commonData
	}
	data := &variantData{
		Title:              "Variant Stats",
		Name:               variantObject.Name,
		NumGames:           stats.NumGames,
		TimePlayed:         timePlayed,
		NumGamesSpeedrun:   stats.NumGamesSpeedrun,
		TimePlayedSpeedrun: timePlayedSpeedrun,
		BestScores:         bestScores,
		AverageScore:       averageScore,
		NumMaxScores:       variantStats.NumMaxScores,
		MaxScoreRate:       maxScoreRate,
		MaxScore:           variantObject.MaxScore,
		NumStrikeouts:      variantStats.NumStrikeouts,
		StrikeoutRate:      strikeoutRate,
		RecentGames:        gameHistoryList,
		Common:             m.getCommonData(),
	}
	m.serveTemplate(w, data, "variant")
}
