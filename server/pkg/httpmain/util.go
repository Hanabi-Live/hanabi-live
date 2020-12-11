package httpmain

import (
	"fmt"
	"io/ioutil"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/Zamiell/hanabi-live/server/pkg/bestscore"
	"github.com/Zamiell/hanabi-live/server/pkg/constants"
	"github.com/Zamiell/hanabi-live/server/pkg/models"
	"github.com/Zamiell/hanabi-live/server/pkg/util"
	"github.com/gin-gonic/gin"
)

// From: https://stackoverflow.com/questions/28889818/formatting-verbose-dates-in-go
func formatDate(datetime time.Time) string {
	suffix := "th"
	switch datetime.Day() {
	case 1, 21, 31: // nolint: gomnd
		suffix = "st"
	case 2, 22: // nolint: gomnd
		suffix = "nd"
	case 3, 23: // nolint: gomnd
		suffix = "rd"
	}
	dateFormatString := fmt.Sprintf("January 2%v, 2006", suffix)
	return datetime.Format(dateFormatString)
}

func (m *Manager) getVariantStatsList(
	statsMap map[int]*models.UserStatsRow,
) (int, []int, []*UserVariantStats) {
	// Convert the map (statsMap) to a slice (variantStatsList),
	// filling in any non-played variants with 0 values
	numMaxScores := 0
	numMaxScoresPerType := make([]int, 5) // For 2-player, 3-player, etc.
	variantStatsList := make([]*UserVariantStats, 0)
	for _, name := range m.variantsManager.VariantNames {
		variant := m.variantsManager.Variants[name]
		maxScore := len(variant.Suits) * constants.PointsPerSuit
		variantStats := &UserVariantStats{ // nolint: exhaustivestruct
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
			if variantStats.AverageScore == zeroString {
				variantStats.AverageScore = "-"
			}

			if stats.NumGames > 0 {
				strikeoutRate := float64(stats.NumStrikeouts) / float64(stats.NumGames) * 100 // nolint: gomnd

				// Round the strikeout rate to 1 decimal place
				variantStats.StrikeoutRate = fmt.Sprintf("%.1f", strikeoutRate)

				// If it ends in ".0", remove the unnecessary digits
				variantStats.StrikeoutRate = strings.TrimSuffix(variantStats.StrikeoutRate, ".0")
			}
		} else {
			// They have not played any games in this particular variant,
			// so initialize the stats object with zero values
			variantStats.BestScores = bestscore.NewBestScores()
			variantStats.AverageScore = "-"
			variantStats.StrikeoutRate = "-"
		}

		variantStatsList = append(variantStatsList, variantStats)
	}

	return numMaxScores, numMaxScoresPerType, variantStatsList
}

func (m *Manager) getPercentageMaxScores(
	numMaxScores int,
	numMaxScoresPerType []int,
) (string, []string) {
	numVariants := len(m.variantsManager.VariantNames)
	numTotalScores := numVariants * bestscore.NumPlayerGameTypes

	percentageMaxScoresPerType := make([]string, 0)
	for _, maxScores := range numMaxScoresPerType {
		percentage := float64(maxScores) / float64(numVariants) * 100 // nolint: gomnd
		percentageString := fmt.Sprintf("%.1f", percentage)
		percentageString = strings.TrimSuffix(percentageString, ".0")
		percentageMaxScoresPerType = append(percentageMaxScoresPerType, percentageString)
	}

	percentageMaxScores := float64(numMaxScores) / float64(numTotalScores) * 100 // nolint: gomnd
	percentageMaxScoresString := fmt.Sprintf("%.1f", percentageMaxScores)
	percentageMaxScoresString = strings.TrimSuffix(percentageMaxScoresString, ".0")

	return percentageMaxScoresString, percentageMaxScoresPerType
}

// getVersion will get the current version of the JavaScript client,
// which is contained in the "version.txt" file.
// We want to read this file every time (as opposed to just reading it on server start) so that we
// can update the client without having to restart the entire server.
func (m *Manager) getVersion() int {
	var fileContents []byte
	if v, err := ioutil.ReadFile(m.versionPath); err != nil {
		m.logger.Errorf("Failed to read the \"%v\" file: %v", m.versionPath, err)
		return 0
	} else {
		fileContents = v
	}
	versionString := string(fileContents)
	versionString = strings.TrimSpace(versionString)
	if v, err := strconv.Atoi(versionString); err != nil {
		m.logger.Errorf(
			"Failed to convert \"%v\" (the contents of the version file) to an integer: %v",
			versionString,
			err,
		)
		return 0
	} else {
		return v
	}
}

func (m *Manager) parsePlayerName(c *gin.Context) (models.User, bool) {
	// Local variables
	w := c.Writer

	// Parse the player name from the URL
	player := c.Param("player1")
	if player == "" {
		http.Error(w, "Error: You must specify a player.", http.StatusNotFound)
		return models.User{}, false
	}
	normalizedUsername := util.NormalizeString(player)

	// Check if the player exists
	if exists, v, err := m.models.Users.GetUserFromNormalizedUsername(
		c,
		normalizedUsername,
	); err != nil {
		m.logger.Errorf("Failed to check to see if player \"%v\" exists: %v", player, err)
		http.Error(
			w,
			http.StatusText(http.StatusInternalServerError),
			http.StatusInternalServerError,
		)
		return models.User{}, false
	} else if exists {
		return v, true
	} else {
		http.Error(w, "Error: That player does not exist in the database.", http.StatusNotFound)
		return models.User{}, false
	}
}

func (m *Manager) parsePlayerNames(c *gin.Context) ([]int, []string, bool) {
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
		player := c.Param(fmt.Sprintf("player%v", i))
		if player == "" {
			if i == 1 {
				http.Error(w, "Error: You must specify a player.", http.StatusNotFound)
				return nil, nil, false
			}
			break
		}

		// Check to see if this is a duplicate player
		// e.g. "/history/Alice/Bob/bob"
		normalizedUsername := util.NormalizeString(player)
		if util.StringInSlice(normalizedUsername, playerNormalizedNames) {
			http.Error(
				w,
				"Error: You can not specify the same player twice.",
				http.StatusNotFound,
			)
			return nil, nil, false
		}

		// Check if the player exists
		var user models.User
		if exists, v, err := m.models.Users.GetUserFromNormalizedUsername(
			c,
			normalizedUsername,
		); err != nil {
			m.logger.Errorf("Failed to check to see if player \"%v\" exists: %v", player, err)
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
				fmt.Sprintf("Error: The player of \"%v\" does not exist in the database.", player),
				http.StatusNotFound,
			)
			return nil, nil, false
		}

		playerIDs = append(playerIDs, user.ID)
		playerNames = append(playerNames, user.Username)
		playerNormalizedNames = append(playerNormalizedNames, normalizedUsername)
	}

	return playerIDs, playerNames, true
}
