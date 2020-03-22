package main

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

type StatsData struct {
	Title  string
	Header bool

	NumGames                   int
	TimePlayed                 string
	NumGamesSpeedrun           int
	TimePlayedSpeedrun         string
	NumVariants                int
	NumMaxScoresPerType        []int
	PercentageMaxScoresPerType []string
	NumMaxScores               int
	PercentageMaxScores        string

	Variants []VariantStatsData
}

type VariantStatsData struct {
	ID            int
	Name          string
	NumGames      int
	BestScores    []*BestScore
	NumMaxScores  int
	MaxScoreRate  string
	AverageScore  string
	NumStrikeouts int
	StrikeoutRate string
}

func httpStats(c *gin.Context) {
	// Local variables
	w := c.Writer

	// Get some global statistics
	var globalStats Stats
	if v, err := models.Games.GetGlobalStats(); err != nil {
		logger.Error("Failed to get the global stats:", err)
		http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
		return
	} else {
		globalStats = v
	}
	var timePlayed string
	if v, err := getGametimeString(globalStats.TimePlayed); err != nil {
		logger.Error("Failed to parse the playtime string:", err)
		http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
		return
	} else {
		timePlayed = v
	}
	var timePlayedSpeedrun string
	if v, err := getGametimeString(globalStats.TimePlayedSpeedrun); err != nil {
		logger.Error("Failed to parse the speedrun playtime string:", err)
		http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
		return
	} else {
		timePlayedSpeedrun = v
	}

	// Get the stats for all variants
	var statsMap map[int]VariantStatsRow
	if v, err := models.VariantStats.GetAll(variantsID); err != nil {
		logger.Error("Failed to get the stats for all the variants:", err)
		http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
		return
	} else {
		statsMap = v
	}

	// Convert the map (statsMap) to a slice (variantStatsList),
	// filling in any non-played variants with 0 values
	numMaxScores := 0
	numMaxScoresPerType := make([]int, 5) // For 2-player, 3-player, etc.
	variantStatsList := make([]VariantStatsData, 0)
	for _, name := range variantsList {
		variant := variants[name]
		maxScore := 5 * len(variant.Suits)
		variantStats := VariantStatsData{
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
			// so initialize the best scores object with zero values
			// The following is copied from the "NewVariantStatsRow()" function
			variantStats.BestScores = make([]*BestScore, 5) // From 2 to 6 players
			for i := range variantStats.BestScores {
				// This will not work if written as "for i, bestScore :="
				variantStats.BestScores[i] = new(BestScore)
				variantStats.BestScores[i].NumPlayers = i + 2
			}

			variantStats.AverageScore = "-"
			variantStats.StrikeoutRate = "-"
		}

		variantStatsList = append(variantStatsList, variantStats)
	}

	percentageMaxScoresPerType := make([]string, 0)
	for _, maxScores := range numMaxScoresPerType {
		percentage := float64(maxScores) / float64(len(variantsList)) * 100
		percentageString := fmt.Sprintf("%.1f", percentage)
		percentageString = strings.TrimSuffix(percentageString, ".0")
		percentageMaxScoresPerType = append(percentageMaxScoresPerType, percentageString)
	}

	percentageMaxScores := float64(numMaxScores) / float64(len(variantsList)*5) * 100
	// (we multiply by 5 because there are max scores for 2 to 6 players)
	percentageMaxScoresString := fmt.Sprintf("%.1f", percentageMaxScores)
	percentageMaxScoresString = strings.TrimSuffix(percentageMaxScoresString, ".0")

	data := StatsData{
		Title: "Stats",

		NumGames:                   globalStats.NumGames,
		TimePlayed:                 timePlayed,
		NumGamesSpeedrun:           globalStats.NumGamesSpeedrun,
		TimePlayedSpeedrun:         timePlayedSpeedrun,
		NumVariants:                len(variantsList),
		NumMaxScoresPerType:        numMaxScoresPerType,
		PercentageMaxScoresPerType: percentageMaxScoresPerType,
		NumMaxScores:               numMaxScores,
		PercentageMaxScores:        percentageMaxScoresString,

		Variants: variantStatsList,
	}

	httpServeTemplate(w, data, "stats")
}
