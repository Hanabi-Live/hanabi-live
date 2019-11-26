package main

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/Zamiell/hanabi-live/src/models"
	"github.com/gin-gonic/gin"
)

type StatsData struct {
	Title  string
	Header bool

	NumGames              int
	TimePlayed            string
	NumGamesSpeedrun      int
	TimePlayedSpeedrun    string
	NumMaxScores          int
	NumMaxScoresPerType   []int

	Variants []VariantStats
}

type VariantStats struct {
	ID            int
	Name          string
	NumGames      int
	BestScores    []*models.BestScore
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
	var globalStats models.Stats
	if v, err := db.Games.GetGlobalStats(); err != nil {
		log.Error("Failed to get the global stats:", err)
		http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
		return
	} else {
		globalStats = v
	}
	var timePlayed string
	if v, err := getGametimeString(globalStats.TimePlayed); err != nil {
		log.Error("Failed to parse the playtime string:", err)
		http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
		return
	} else {
		timePlayed = v
	}
	var timePlayedSpeedrun string
	if v, err := getGametimeString(globalStats.TimePlayedSpeedrun); err != nil {
		log.Error("Failed to parse the speedrun playtime string:", err)
		http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
		return
	} else {
		timePlayedSpeedrun = v
	}

	// Get the stats for all variants
	var statsMap map[int]models.VariantStatsRow
	if v, err := db.VariantStats.GetAll(variantsID); err != nil {
		log.Error("Failed to get the stats for all the variants:", err)
		http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
		return
	} else {
		statsMap = v
	}

	// Convert the map (statsMap) to a slice (variantStatsList),
	// filling in any non-played variants with 0 values
	numMaxScores := 0
	numMaxScoresPerType := make([]int, 5) // For 2-player, 3-player, etc.
	variantStatsList := make([]VariantStats, 0)
	for _, name := range variantsList {
		variant := variants[name]
		maxScore := 5 * len(variant.Suits)
		variantStats := VariantStats{
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
			variantStats.BestScores = make([]*models.BestScore, 5) // From 2 to 6 players
			for i := range variantStats.BestScores {
				// This will not work if written as "for i, bestScore :="
				variantStats.BestScores[i] = new(models.BestScore)
				variantStats.BestScores[i].NumPlayers = i + 2
			}

			variantStats.AverageScore = "-"
			variantStats.StrikeoutRate = "-"
		}

		variantStatsList = append(variantStatsList, variantStats)
	}

	data := StatsData{
		Title: "Stats",

		NumGames:              globalStats.NumGames,
		TimePlayed:            timePlayed,
		NumGamesSpeedrun:      globalStats.NumGamesSpeedrun,
		TimePlayedSpeedrun:    timePlayedSpeedrun,
		NumMaxScores:          numMaxScores,
		NumMaxScoresPerType:   numMaxScoresPerType,

		Variants: variantStatsList,
	}

	httpServeTemplate(w, data, "stats")
}
