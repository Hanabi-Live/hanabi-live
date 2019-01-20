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
	BestScores    []BestScore
	AverageScore  int
	StrikeoutRate int
}
type BestScore struct {
	NumPlayers int
	Score      int
	Modifier   int // (see the stats section in "gameEnd.go")
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
		if stats.BestScore2 == maxScoreForThisVariant {
			totalMaxScores++
		}
		if stats.BestScore3 == maxScoreForThisVariant {
			totalMaxScores++
		}
		if stats.BestScore4 == maxScoreForThisVariant {
			totalMaxScores++
		}
		if stats.BestScore5 == maxScoreForThisVariant {
			totalMaxScores++
		}
		if stats.BestScore6 == maxScoreForThisVariant {
			totalMaxScores++
		}

		updatedStats := VariantStats{
			Name:          variant.Name,
			NumGames:      stats.NumPlayed,
			MaxScore:      maxScoreForThisVariant,
			BestScores:    make([]BestScore, 0),
			AverageScore:  int((math.Round(stats.AverageScore))),
			StrikeoutRate: int(math.Round(stats.StrikeoutRate * 100)),
		}
		updatedStats.BestScores = append(updatedStats.BestScores, BestScore{
			NumPlayers: 2,
			Score:      stats.BestScore2,
			Modifier:   stats.BestScore2Mod,
		})
		updatedStats.BestScores = append(updatedStats.BestScores, BestScore{
			NumPlayers: 3,
			Score:      stats.BestScore3,
			Modifier:   stats.BestScore3Mod,
		})
		updatedStats.BestScores = append(updatedStats.BestScores, BestScore{
			NumPlayers: 4,
			Score:      stats.BestScore4,
			Modifier:   stats.BestScore4Mod,
		})
		updatedStats.BestScores = append(updatedStats.BestScores, BestScore{
			NumPlayers: 5,
			Score:      stats.BestScore5,
			Modifier:   stats.BestScore5Mod,
		})
		updatedStats.BestScores = append(updatedStats.BestScores, BestScore{
			NumPlayers: 6,
			Score:      stats.BestScore6,
			Modifier:   stats.BestScore6Mod,
		})
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
