package main

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
)

type VariantData struct {
	Title  string
	Header bool
	Name   string

	NumGames           int
	TimePlayed         string
	NumGamesSpeedrun   int
	TimePlayedSpeedrun string
	BestScores         []int
	NumMaxScores       int
	MaxScoreRate       string
	MaxScore           int
	AverageScore       string
	NumStrikeouts      int
	StrikeoutRate      string

	RecentGames []*GameHistory
}

func httpVariant(c *gin.Context) {
	// Local variables
	w := c.Writer

	// Parse the player name from the URL
	variantIDstring := c.Param("id")
	if variantIDstring == "" {
		http.Error(w, "Error: You must specify a variant ID.", http.StatusNotFound)
		return
	}

	// Validate that it is a number
	var variantID int
	if v, err := strconv.Atoi(variantIDstring); err != nil {
		http.Error(w, "Error: The variant ID must be a number.", http.StatusBadRequest)
		return
	} else {
		variantID = v
	}

	// Validate that it is a valid variant ID
	var variantName string
	if v, ok := variantsID[variantID]; !ok {
		http.Error(w, "Error: That is not a valid variant ID.", http.StatusBadRequest)
		return
	} else {
		variantName = v
	}

	// Get the stats for this variant
	var variantStats VariantStatsRow
	if v, err := models.VariantStats.Get(variantID); err != nil {
		logger.Error("Failed to get the variant stats for variant "+strconv.Itoa(variantID)+":", err)
		http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
		return
	} else {
		variantStats = v
	}

	bestScores := make([]int, 0)
	for _, bestScore := range variantStats.BestScores {
		bestScores = append(bestScores, bestScore.Score)
	}
	maxScoreRateFloat := float64(variantStats.NumMaxScores) / float64(variantStats.NumGames) * 100
	strikeoutRateFloat := float64(variantStats.NumStrikeouts) / float64(variantStats.NumGames) * 100

	// Round them to 1 decimal place
	maxScoreRate := fmt.Sprintf("%.1f", maxScoreRateFloat)
	strikeoutRate := fmt.Sprintf("%.1f", strikeoutRateFloat)
	averageScore := fmt.Sprintf("%.1f", variantStats.AverageScore)

	// If it ends in ".0", remove the unnecessary digits
	maxScoreRate = strings.TrimSuffix(maxScoreRate, ".0")
	strikeoutRate = strings.TrimSuffix(strikeoutRate, ".0")
	if averageScore == "0.0" {
		averageScore = "-"
	}

	// Get additional stats (that are not part of the "variant_stats" table)
	var stats Stats
	if v, err := models.Games.GetVariantStats(variantID); err != nil {
		logger.Error("Failed to get the stats for variant "+strconv.Itoa(variantID)+":", err)
		http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
		return
	} else {
		stats = v
	}
	var timePlayed string
	if v, err := getGametimeString(stats.TimePlayed); err != nil {
		logger.Error("Failed to parse the playtime string for variant "+strconv.Itoa(variantID)+":", err)
		http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
		return
	} else {
		timePlayed = v
	}
	var timePlayedSpeedrun string
	if v, err := getGametimeString(stats.TimePlayedSpeedrun); err != nil {
		logger.Error("Failed to parse the speedrun playtime string for variant "+strconv.Itoa(variantID)+":", err)
		http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
		return
	} else {
		timePlayedSpeedrun = v
	}

	// Get recent games played on this variant
	var recentGames []*GameHistory
	if v, err := models.Games.GetVariantHistory(variantID, 50); err != nil {
		logger.Error("Failed to get recent games for variant "+strconv.Itoa(variantID)+":", err)
		http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
		return
	} else {
		recentGames = v
	}

	data := VariantData{
		Title: "Variant Stats",
		Name:  variantsID[variantID],

		NumGames:           stats.NumGames,
		TimePlayed:         timePlayed,
		NumGamesSpeedrun:   stats.NumGamesSpeedrun,
		TimePlayedSpeedrun: timePlayedSpeedrun,
		BestScores:         bestScores,
		AverageScore:       averageScore,
		NumMaxScores:       variantStats.NumMaxScores,
		MaxScoreRate:       maxScoreRate,
		MaxScore:           variants[variantName].MaxScore,
		NumStrikeouts:      variantStats.NumStrikeouts,
		StrikeoutRate:      strikeoutRate,

		RecentGames: recentGames,
	}

	httpServeTemplate(w, data, "variant")
}
