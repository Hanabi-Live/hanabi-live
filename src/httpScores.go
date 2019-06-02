package main

import (
	"database/sql"
	"fmt"
	"math"
	"net/http"
	"strings"
	"time"

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
	TimePlayed     string
	TimeRaced      string
	VariantStats   []VariantStats
}
type VariantStats struct {
	ID            int
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
	timePlayed := ""
	timeRaced := ""
	totalMaxScores := 0
	variantStats := make([]VariantStats, 0)
	for i, name := range variantsList {
		variant := variants[name]

		var stats models.Stats
		if v, err := db.UserStats.Get(user.ID, variant.ID); err != nil {
			log.Error("Failed to get the stats for player \""+user.Username+"\" for variant \""+name+"\":", err)
			http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
			return
		} else {
			stats = v
		}

		if i == 0 {
			numGames = stats.NumPlayedAll
			if v, err := getGametimeString(stats.TimePlayed); err != nil {
				log.Error("Failed to get the timing stats for player \""+user.Username, err)
				http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
				return
			} else {
				timePlayed = v
			}
			if v, err := getGametimeString(stats.TimeRaced); err != nil {
				log.Error("Failed to get the timing stats for player \""+user.Username, err)
				http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
				return
			} else {
				timeRaced = v
			}
		}

		maxScoreForThisVariant := 5 * len(variant.Suits)
		for _, bestScore := range stats.BestScores {
			if bestScore.Score == maxScoreForThisVariant {
				totalMaxScores++
			}
		}

		updatedStats := VariantStats{
			ID:            i,
			Name:          name,
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
		TotalMaxScores: len(variantsList) * 5, // For 2 to 6 players
		TimePlayed:     timePlayed,
		TimeRaced:      timeRaced,
		VariantStats:   variantStats,
	}

	if strings.HasPrefix(c.Request.URL.Path, "/missing-scores/") {
		data.Title = "Missing Scores"
		httpServeTemplate(w, data, "profile", "missingScores")
	} else {
		httpServeTemplate(w, data, "profile", "scores")
	}
}

func getGametimeString(timeString sql.NullString) (string, error) {
	if !timeString.Valid {
		return "", nil
	}

	playtime, err := time.ParseDuration(timeString.String + "s")
	// Display seconds only for users that played less than a minute
	if playtime.Minutes() < 1 {
		seconds := math.Round(playtime.Seconds())
		msg := fmt.Sprintf("%.0f second", seconds)
		if int(seconds) != 1 {
			msg += "s"
		}
		return msg, nil
	}
	// Display minutes only for users that played less than an hour
	if playtime.Hours() < 1 {
		minutes := math.Round(playtime.Minutes())
		msg := fmt.Sprintf("%.0f minute", minutes)
		if int(minutes) != 1 {
			msg += "s"
		}
		return msg, nil
	}

	// Convert Duration variable into hours and minutes
	minutes := int(playtime.Minutes())
	hours := int(playtime.Hours())
	minutes -= hours * 60

	// Convert hours into months and hours
	months := float64(hours) * 0.00136895463
	hours -= int(math.RoundToEven(months) / 0.00136895463)

	hourStr := "hour"
	if hours != 1 {
		hourStr += "s"
	}

	minStr := "minute"
	if minutes != 1 {
		minStr += "s"
	}

	var msg string
	// Display months only for users that played over a month
	if months >= 1 {
		monthStr := "month"
		if int(months) != 1 {
			monthStr += "s"
		}
		msg = "%.1fh (%.0f %s, %d %s and %d %s)"
		msg = fmt.Sprintf(msg, playtime.Hours(), months, monthStr, hours, hourStr, minutes, minStr)
	} else {
		msg = "%.1fh (%d %s and %d %s)"
		msg = fmt.Sprintf(msg, playtime.Hours(), hours, hourStr, minutes, minStr)
	}

	return msg, err
}
