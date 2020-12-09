package httpmain

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/Zamiell/hanabi-live/server/pkg/bestscore"
	"github.com/Zamiell/hanabi-live/server/pkg/constants"
	"github.com/Zamiell/hanabi-live/server/pkg/models"
	"github.com/Zamiell/hanabi-live/server/pkg/util"
	"github.com/gin-gonic/gin"
)

type VariantStatsData struct {
	ID            int
	Name          string
	NumGames      int
	BestScores    []*bestscore.BestScore
	NumMaxScores  int
	MaxScoreRate  string
	AverageScore  string
	NumStrikeouts int
	StrikeoutRate string
}

func stats(c *gin.Context) {
	// Local variables
	w := c.Writer
	numVariants := len(hVariantsManager.VariantNames)

	// Get some global statistics
	var globalStats models.Stats
	if v, err := hModels.Games.GetGlobalStats(c); err != nil {
		hLogger.Errorf("Failed to get the global stats: %v", err)
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
		if v, err := util.SecondsToDurationString(globalStats.TimePlayed); err != nil {
			hLogger.Errorf(
				"Failed to parse the duration of \"%v\" for the global stats: %v",
				globalStats.TimePlayed,
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

	// It will only be valid if they have played a speedrun game
	timePlayedSpeedrun := ""
	if globalStats.TimePlayedSpeedrun != 0 {
		if v, err := util.SecondsToDurationString(globalStats.TimePlayedSpeedrun); err != nil {
			hLogger.Errorf(
				"Failed to parse the duration of \"%v\" for the global stats: %v",
				globalStats.TimePlayedSpeedrun,
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

	// Get the stats for all variants
	var statsMap map[int]models.VariantStatsRow
	if v, err := hModels.VariantStats.GetAll(c); err != nil {
		hLogger.Errorf("Failed to get the stats for all the variants: %v", err)
		http.Error(
			w,
			http.StatusText(http.StatusInternalServerError),
			http.StatusInternalServerError,
		)
		return
	} else {
		statsMap = v
	}

	// Convert the map (statsMap) to a slice (variantStatsList),
	// filling in any non-played variants with 0 values
	numMaxScores := 0
	numMaxScoresPerType := make([]int, 5) // For 2-player, 3-player, etc.
	variantStatsList := make([]*VariantStatsData, 0)
	for _, name := range hVariantsManager.VariantNames {
		variant := hVariantsManager.Variants[name]
		maxScore := len(variant.Suits) * constants.PointsPerSuit
		variantStats := &VariantStatsData{ // nolint: exhaustivestruct
			ID:   variant.ID,
			Name: name,
		}

		if stats, ok := statsMap[variant.ID]; ok {
			// Someone has played at least one game in this particular variant
			for j, bestScore := range stats.BestScores {
				if bestScore.Score == maxScore {
					numMaxScores++
					numMaxScoresPerType[j]++
				}
			}

			variantStats.NumGames = stats.NumGames
			variantStats.BestScores = stats.BestScores
			variantStats.NumMaxScores = stats.NumMaxScores
			variantStats.NumStrikeouts = stats.NumStrikeouts

			// Round the average score to 1 decimal place
			variantStats.AverageScore = fmt.Sprintf("%.1f", stats.AverageScore)
			if variantStats.AverageScore == "0.0" {
				variantStats.AverageScore = "-"
			}

			if stats.NumGames > 0 {
				strikeoutRate := float64(stats.NumStrikeouts) / float64(stats.NumGames) * 100
				maxScoreRate := float64(stats.NumMaxScores) / float64(stats.NumGames) * 100

				// Round them to 1 decimal place
				variantStats.StrikeoutRate = fmt.Sprintf("%.1f", strikeoutRate)
				variantStats.MaxScoreRate = fmt.Sprintf("%.1f", maxScoreRate)

				// If it ends in ".0", remove the unnecessary digits
				variantStats.StrikeoutRate = strings.TrimSuffix(variantStats.StrikeoutRate, ".0")
				variantStats.MaxScoreRate = strings.TrimSuffix(variantStats.MaxScoreRate, ".0")
			}
		} else {
			// There have been no games played in this particular variant,
			// so initialize the stats object with zero values
			variantStats.BestScores = bestscore.NewBestScores()
			variantStats.AverageScore = "-"
			variantStats.StrikeoutRate = "-"
		}

		variantStatsList = append(variantStatsList, variantStats)
	}

	percentageMaxScoresPerType := make([]string, 0)
	for _, maxScores := range numMaxScoresPerType {
		percentage := float64(maxScores) / float64(numVariants) * 100
		percentageString := fmt.Sprintf("%.1f", percentage)
		percentageString = strings.TrimSuffix(percentageString, ".0")
		percentageMaxScoresPerType = append(percentageMaxScoresPerType, percentageString)
	}

	percentageMaxScores := float64(numMaxScores) / float64(numVariants*5) * 100
	// (we multiply by 5 because there are max scores for 2 to 6 players)
	percentageMaxScoresString := fmt.Sprintf("%.1f", percentageMaxScores)
	percentageMaxScoresString = strings.TrimSuffix(percentageMaxScoresString, ".0")

	data := &TemplateData{ // nolint: exhaustivestruct
		Title: "Stats",

		NumGames:                   globalStats.NumGames,
		TimePlayed:                 timePlayed,
		NumGamesSpeedrun:           globalStats.NumGamesSpeedrun,
		TimePlayedSpeedrun:         timePlayedSpeedrun,
		NumVariants:                numVariants,
		NumMaxScoresPerType:        numMaxScoresPerType,
		PercentageMaxScoresPerType: percentageMaxScoresPerType,
		NumMaxScores:               numMaxScores,
		PercentageMaxScores:        percentageMaxScoresString,

		Variants: variantStatsList,
	}

	serveTemplate(w, data, "stats")
}
