package main

import (
	"math"
	"net/http"
	"strings"

	"github.com/Zamiell/hanabi-live/src/models"
	"github.com/gin-gonic/gin"
)

type ProfileData struct {
	Title          string
	Header         bool
	Name           string
	NumGames       int
	NumMaxScores   int
	TotalMaxScores int
	VariantStats   []VariantStats
}
type VariantStats struct {
	Name          string
	NumGames      int
	MaxScore      int
	BestScores    []*models.BestScore
	AverageScore  int
	StrikeoutRate int
}

func httpScores(c *gin.Context) {
	// Local variables
	w := c.Writer

	// Parse the player name from the URL
	player := c.Param("player")
	if player == "" {
		http.Error(w, "Error: You must specify a player.", http.StatusNotFound)
		return
	}

	// Check if the player exists
	var user models.User
	if exists, v, err := db.Users.Get(player); err != nil {
		log.Error("Failed to check to see if player \""+player+"\" exists:", err)
		http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
		return
	} else if exists {
		user = v
	} else {
		http.Error(w, http.StatusText(http.StatusNotFound), http.StatusNotFound)
		return
	}

	// Get the stats for this player
	numGames := 0
	totalMaxScores := 0
	variantStats := make([]VariantStats, 0)
	for i, variant := range variantDefinitions {
		var stats models.Stats
		if v, err := db.UserStats.Get(user.ID, variant.ID); err != nil {
			log.Error("Failed to get the stats for player \""+user.Username+"\" for variant \""+variant.Name+"\":", err)
			http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
			return
		} else {
			stats = v
		}

		if i == 0 {
			numGames = stats.NumPlayedAll
		}

		maxScoreForThisVariant := 5 * len(variant.Suits)
		for _, bestScore := range stats.BestScores {
			if bestScore.Score == maxScoreForThisVariant {
				totalMaxScores++
			}
		}

		updatedStats := VariantStats{
			Name:          variant.Name,
			NumGames:      stats.NumPlayed,
			MaxScore:      maxScoreForThisVariant,
			BestScores:    stats.BestScores,
			AverageScore:  int((math.Round(stats.AverageScore))),
			StrikeoutRate: int(math.Round(stats.StrikeoutRate * 100)),
		}
		variantStats = append(variantStats, updatedStats)
	}

	data := ProfileData{
		Title:          "Scores",
		Name:           user.Username,
		NumGames:       numGames,
		NumMaxScores:   totalMaxScores,
		TotalMaxScores: len(variantDefinitions) * 5, // For 2 to 6 players
		VariantStats:   variantStats,
	}

	if strings.HasPrefix(c.Request.URL.Path, "/missing-scores/") {
		data.Title = "Missing Scores"
		httpServeTemplate(w, data, "profile", "missingScores")
	} else {
		httpServeTemplate(w, data, "profile", "scores")
	}
}
