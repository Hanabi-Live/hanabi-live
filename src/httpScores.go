package main

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

type ProfileData struct {
	Title  string
	Header bool
	Name   string

	NumGames                   int
	TimePlayed                 string
	NumGamesSpeedrun           int
	TimePlayedSpeedrun         string
	NumMaxScores               int
	TotalMaxScores             int
	PercentageMaxScores        string
	NumMaxScoresPerType        []int    // Used on the "Missing Scores" page
	PercentageMaxScoresPerType []string // Used on the "Missing Scores" page

	VariantStats []UserVariantStats
}

type UserVariantStats struct {
	ID            int
	Name          string
	NumGames      int
	MaxScore      int
	BestScores    []*BestScore
	AverageScore  string
	NumStrikeouts int
	StrikeoutRate string
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
	var user User
	if exists, v, err := models.Users.Get(player); err != nil {
		logger.Error("Failed to check to see if player \""+player+"\" exists:", err)
		http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
		return
	} else if exists {
		user = v
	} else {
		http.Error(w, "Error: That player does not exist in the database.", http.StatusNotFound)
		return
	}

	// Get basic stats for this player
	var profileStats Stats
	if v, err := models.Games.GetProfileStats(user.ID); err != nil {
		logger.Error("Failed to get the profile stats player "+"\""+user.Username+"\":", err)
		http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
		return
	} else {
		profileStats = v
	}
	var timePlayed string
	if v, err := getGametimeString(profileStats.TimePlayed); err != nil {
		logger.Error("Failed to parse the playtime string for player \""+user.Username+"\":", err)
		http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
		return
	} else {
		timePlayed = v
	}
	var timePlayedSpeedrun string
	if v, err := getGametimeString(profileStats.TimePlayedSpeedrun); err != nil {
		logger.Error("Failed to parse the speedrun playtime string for player \""+user.Username+"\":", err)
		http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
		return
	} else {
		timePlayedSpeedrun = v
	}

	// Get all of the variant-specific stats for this player
	var statsMap map[int]UserStatsRow
	if v, err := models.UserStats.GetAll(user.ID); err != nil {
		logger.Error("Failed to get all of the variant-specific stats for player \""+user.Username+"\":", err)
		http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
		return
	} else {
		statsMap = v
	}

	// Convert the map (statsMap) to a slice (variantStatsList),
	// filling in any non-played variants with 0 values
	numMaxScores := 0
	numMaxScoresPerType := make([]int, 5) // For 2-player, 3-player, etc.
	variantStatsList := make([]UserVariantStats, 0)
	for _, name := range variantsList {
		variant := variants[name]
		maxScore := 5 * len(variant.Suits)
		variantStats := UserVariantStats{
			ID:       variant.ID,
			Name:     name,
			MaxScore: maxScore,
		}

		if stats, ok := statsMap[variant.ID]; ok {
			// They have played at least one game in this particular variant
			for j, bestScore := range stats.BestScores {
				if bestScore.Score == maxScore {
					numMaxScores++
					numMaxScoresPerType[j]++
				}
			}

			variantStats.NumGames = stats.NumGames
			variantStats.BestScores = stats.BestScores
			variantStats.NumStrikeouts = stats.NumStrikeouts

			// Round the average score to 1 decimal place
			variantStats.AverageScore = fmt.Sprintf("%.1f", stats.AverageScore)
			if variantStats.AverageScore == "0.0" {
				variantStats.AverageScore = "-"
			}

			if stats.NumGames > 0 {
				strikeoutRate := float64(stats.NumStrikeouts) / float64(stats.NumGames) * 100

				// Round the strikeout rate to 1 decimal place
				variantStats.StrikeoutRate = fmt.Sprintf("%.1f", strikeoutRate)

				// If it ends in ".0", remove the unnecessary digits
				variantStats.StrikeoutRate = strings.TrimSuffix(variantStats.StrikeoutRate, ".0")
			}
		} else {
			// They have not played any games in this particular variant,
			// so initialize the best scores object with zero values

			// The following is copied from the "NewUserStatsRow()" function
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

	data := ProfileData{
		Title: "Scores",
		Name:  user.Username,

		NumGames:                   profileStats.NumGames,
		TimePlayed:                 timePlayed,
		NumGamesSpeedrun:           profileStats.NumGamesSpeedrun,
		TimePlayedSpeedrun:         timePlayedSpeedrun,
		NumMaxScores:               numMaxScores,
		TotalMaxScores:             len(variantsList) * 5, // For 2 to 6 players
		PercentageMaxScores:        percentageMaxScoresString,
		NumMaxScoresPerType:        numMaxScoresPerType,
		PercentageMaxScoresPerType: percentageMaxScoresPerType,

		VariantStats: variantStatsList,
	}

	if strings.HasPrefix(c.Request.URL.Path, "/missing-scores/") {
		data.Title = "Missing Scores"
		httpServeTemplate(w, data, "profile", "missingScores")
	} else {
		httpServeTemplate(w, data, "profile", "scores")
	}
}
