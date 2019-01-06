package main

import (
	"fmt"
	"math"
	"net/http"
	"strconv"
	"strings"

	"github.com/Zamiell/hanabi-live/src/models"
	"github.com/gin-gonic/gin"
)

func httpProfile(c *gin.Context) {
	// Local variables
	w := c.Writer

	// Parse the player name from the URL
	player := c.Params.ByName("player")
	if player == "" {
		http.Error(w, http.StatusText(http.StatusNotFound), http.StatusNotFound)
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

	// We will return a text document containing all of their stats
	text := ""

	// Get the stats for this player
	title := "Hanabi.live Statistics for " + user.Username
	text += "+-"
	for i := 0; i < len(title); i++ {
		text += "-"
	}
	text += "-+\n"
	text += "| " + title + " |\n"
	text += "+-"
	for i := 0; i < len(title); i++ {
		text += "-"
	}
	text += "-+\n"
	text += "\n"

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
			text += "Total games played: " + strconv.Itoa(stats.NumPlayed) + "\n"
			text += "Total max scores:\n"
			text += "\n"
		}

		if i == 0 {
			text += variant.Name + "\n"
		} else {
			text += "Variant " + strconv.Itoa(i) + " - " + variant.Name + "\n"
		}

		text += "- Total games played: " + strconv.Itoa(stats.NumPlayedVariant) + "\n"
		text += "- Best 2-player score: " + strconv.Itoa(stats.BestScoreVariant2) + "\n"
		text += "- Best 3-player score: " + strconv.Itoa(stats.BestScoreVariant3) + "\n"
		text += "- Best 4-player score: " + strconv.Itoa(stats.BestScoreVariant4) + "\n"
		text += "- Best 5-player score: " + strconv.Itoa(stats.BestScoreVariant5) + "\n"
		text += "- Average score: " + strconv.Itoa(int((math.Round(stats.AverageScoreVariant)))) + "\n"
		text += "- Strikeout rate: " + strconv.Itoa(int(math.Round(stats.StrikeoutRateVariant*100))) + "%%\n" // We must escape the percent sign here
		text += "\n"

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
	}

	// Edit in the max scores
	maxScoresText := strconv.Itoa(totalMaxScores) + " / " + strconv.Itoa(len(variantDefinitions)*4)
	text = strings.Replace(text, "Total max scores:", "Total max scores: "+maxScoresText, 1)

	// Get the player's entire game history
	var history []*models.GameHistory
	if v, err := db.Games.GetUserHistory(user.ID, 0, 0, true); err != nil {
		log.Error("Failed to get the history for player \""+user.Username+"\":", err)
		return
	} else {
		history = v
	}
	history = historyFillVariants(history)

	text += "\n\n"
	text += "+-------------------+\n"
	text += "| Full Game History |\n"
	text += "+-------------------+\n"
	text += "\n"

	if len(history) == 0 {
		text += "(no games played)\n"
	}

	for _, g := range history {
		text += "Game #" + strconv.Itoa(g.ID) + "\n"
		text += "- " + strconv.Itoa(g.NumPlayers) + " players\n"
		text += "- Score: " + strconv.Itoa(g.Score) + "\n"
		text += "- Variant: " + g.Variant + "\n"
		text += "- Date: " + g.DatetimeFinished.Format("Mon Jan 02 15:04:05 MST 2006") + "\n" // Same as the Linux date command
		text += "- Other players: " + g.OtherPlayerNames + "\n"
		text += "- Other scores: " + strconv.Itoa(g.NumSimilar) + "\n"
		text += "\n"
	}

	if _, err := fmt.Fprintf(w, text); err != nil {
		log.Error("Failed to write out the profile text:", err)
		http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
		return
	}
}
