package main

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
)

func httpParsePlayerName(c *gin.Context) (User, bool) {
	// Local variables
	w := c.Writer

	// Parse the player name from the URL
	player := c.Param("player1")
	if player == "" {
		http.Error(w, "Error: You must specify a player.", http.StatusNotFound)
		return User{}, false
	}
	normalizedUsername := normalizeString(player)

	// Check if the player exists
	if exists, v, err := models.Users.GetUserFromNormalizedUsername(
		normalizedUsername,
	); err != nil {
		logger.Error("Failed to check to see if player \""+player+"\" exists:", err)
		http.Error(
			w,
			http.StatusText(http.StatusInternalServerError),
			http.StatusInternalServerError,
		)
		return User{}, false
	} else if exists {
		return v, true
	} else {
		http.Error(w, "Error: That player does not exist in the database.", http.StatusNotFound)
		return User{}, false
	}
}

func httpParsePlayerNames(c *gin.Context) ([]int, []string, bool) {
	// Local variables
	w := c.Writer

	// Parse the player name(s) from the URL
	// Normally, there will be just one player, e.g. "/history/Alice"
	// But users can also request history for a specific combination of players,
	// e.g. "/history/Alice/Bob/Cathy"
	playerIDs := make([]int, 0)
	playerNames := make([]string, 0)
	playerNormalizedNames := make([]string, 0)
	for i := 1; i <= 6; i++ {
		player := c.Param("player" + strconv.Itoa(i))
		if player == "" {
			if i == 1 {
				http.Error(w, "Error: You must specify a player.", http.StatusNotFound)
				return nil, nil, false
			}
			break
		}

		// Check to see if this is a duplicate player
		// e.g. "/history/Alice/Bob/bob"
		normalizedUsername := normalizeString(player)
		if stringInSlice(normalizedUsername, playerNormalizedNames) {
			http.Error(
				w,
				"Error: You can not specify the same player twice.",
				http.StatusNotFound,
			)
			return nil, nil, false
		}

		// Check if the player exists
		var user User
		if exists, v, err := models.Users.GetUserFromNormalizedUsername(
			normalizedUsername,
		); err != nil {
			logger.Error("Failed to check to see if player \""+player+"\" exists:", err)
			http.Error(
				w,
				http.StatusText(http.StatusInternalServerError),
				http.StatusInternalServerError,
			)
			return nil, nil, false
		} else if exists {
			user = v
		} else {
			http.Error(
				w,
				"Error: The player of \""+player+"\" does not exist in the database.",
				http.StatusNotFound,
			)
			return nil, nil, false
		}

		playerIDs = append(playerIDs, user.ID)
		playerNames = append(playerNames, user.Username)
		playerNormalizedNames = append(playerNames, normalizedUsername)
	}

	return playerIDs, playerNames, true
}

func httpGetVariantStatsList(statsMap map[int]*UserStatsRow) (int, []int, []*UserVariantStats) {
	// Convert the map (statsMap) to a slice (variantStatsList),
	// filling in any non-played variants with 0 values
	numMaxScores := 0
	numMaxScoresPerType := make([]int, 5) // For 2-player, 3-player, etc.
	variantStatsList := make([]*UserVariantStats, 0)
	for _, name := range variantNames {
		variant := variants[name]
		maxScore := len(variant.Suits) * PointsPerSuit
		variantStats := &UserVariantStats{
			ID:       variant.ID,
			Name:     name,
			MaxScore: maxScore,
		}

		if stats, ok := statsMap[variant.ID]; ok {
			// This player has played at least one game in this particular variant
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
			// so initialize the stats object with zero values
			variantStats.BestScores = NewBestScores()
			variantStats.AverageScore = "-"
			variantStats.StrikeoutRate = "-"
		}

		variantStatsList = append(variantStatsList, variantStats)
	}

	return numMaxScores, numMaxScoresPerType, variantStatsList
}

func httpGetPercentageMaxScores(numMaxScores int, numMaxScoresPerType []int) (string, []string) {
	percentageMaxScoresPerType := make([]string, 0)
	for _, maxScores := range numMaxScoresPerType {
		percentage := float64(maxScores) / float64(len(variantNames)) * 100
		percentageString := fmt.Sprintf("%.1f", percentage)
		percentageString = strings.TrimSuffix(percentageString, ".0")
		percentageMaxScoresPerType = append(percentageMaxScoresPerType, percentageString)
	}

	percentageMaxScores := float64(numMaxScores) / float64(len(variantNames)*5) * 100
	// (we multiply by 5 because there are max scores for 2 to 6 players)
	percentageMaxScoresString := fmt.Sprintf("%.1f", percentageMaxScores)
	percentageMaxScoresString = strings.TrimSuffix(percentageMaxScoresString, ".0")

	return percentageMaxScoresString, percentageMaxScoresPerType
}
