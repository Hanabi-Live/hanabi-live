package main

import (
	"math"
	"net/http"

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
	Score    int
	Modifier int
	// 0 if no extra options
	// 1 if deck play
	// 2 if empty clues
	// 3 if both
}

func httpProfile(c *gin.Context) {
	// Local variables
	w := c.Writer

	// Parse the player name from the URL
	player := c.Params.ByName("player")
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

	data := ProfileData{
		Title:        "Profile",
		Header:       true,
		Name:         user.Username,
		VariantStats: make([]VariantStats, 0),
	}

	// Get the stats for this player
	totalMaxScores := 0
	for i, variant := range variantDefinitions {
		var stats models.Stats
		if v, err := db.Users.GetStats(user.ID, variant.ID); err != nil {
			log.Error("Failed to get the stats for player \""+user.Username+"\" for variant \""+variant.Name+"\":", err)
			http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
			return
		} else {
			stats = v
		}

		if i == 0 {
			data.NumGames = stats.NumPlayed
		}

		maxScoreForThisVariant := 5 * len(variant.Suits)
		if stats.BestScoreVariant2 == maxScoreForThisVariant {
			totalMaxScores++
		}
		if stats.BestScoreVariant3 == maxScoreForThisVariant {
			totalMaxScores++
		}
		if stats.BestScoreVariant4 == maxScoreForThisVariant {
			totalMaxScores++
		}
		if stats.BestScoreVariant5 == maxScoreForThisVariant {
			totalMaxScores++
		}

		compiledStats := VariantStats{
			Name:          variant.Name,
			NumGames:      stats.NumPlayedVariant,
			MaxScore:      maxScoreForThisVariant,
			BestScores:    make([]BestScore, 0),
			AverageScore:  int((math.Round(stats.AverageScoreVariant))),
			StrikeoutRate: int(math.Round(stats.StrikeoutRateVariant * 100)),
		}
		compiledStats.BestScores = append(compiledStats.BestScores, BestScore{
			Score:    stats.BestScoreVariant2,
			Modifier: stats.BestScoreVariant2,
		})
		compiledStats.BestScores = append(compiledStats.BestScores, BestScore{
			Score:    stats.BestScoreVariant3,
			Modifier: stats.BestScoreVariant3,
		})
		compiledStats.BestScores = append(compiledStats.BestScores, BestScore{
			Score:    stats.BestScoreVariant4,
			Modifier: stats.BestScoreVariant4,
		})
		compiledStats.BestScores = append(compiledStats.BestScores, BestScore{
			Score:    stats.BestScoreVariant5,
			Modifier: stats.BestScoreVariant5,
		})
		/*
			compiledStats.BestScores = append(compiledStats.BestScores, BestScore{
				Score:    stats.BestScoreVariant6,
				Modifier: stats.BestScoreVariant6,
			})
		*/
		data.VariantStats = append(data.VariantStats, compiledStats)
	}

	// Add the total max scores
	data.NumMaxScores = totalMaxScores
	data.TotalMaxScores = len(variantDefinitions) * 4

	httpServeTemplate(w, data, "profile")
}
