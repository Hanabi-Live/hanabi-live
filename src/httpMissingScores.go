package main

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/Zamiell/hanabi-live/src/models"
	"github.com/gin-gonic/gin"
)

func httpMissingScores(c *gin.Context) {
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

	// We will return a text document containing all of their missing scores
	text := ""

	// Make the title
	title := "Missing Perfect Scores for " + user.Username
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
			text += "Total max scores:\n"
			text += "\n"
		}

		line := ""
		if i != 0 {
			line += "Variant " + strconv.Itoa(i) + " - "
		}
		line += variant.Name + " - "

		maxScoreForThisVariant := 5 * len(variant.Suits)
		if stats.BestScoreVariant2 != maxScoreForThisVariant {
			text += line + "2-player\n"
			totalMaxScores++
		}
		if stats.BestScoreVariant3 != maxScoreForThisVariant {
			text += line + "3-player\n"
			totalMaxScores++
		}
		if stats.BestScoreVariant4 != maxScoreForThisVariant {
			text += line + "4-player\n"
			totalMaxScores++
		}
		if stats.BestScoreVariant5 != maxScoreForThisVariant {
			text += line + "5-player\n"
			totalMaxScores++
		}
		/*
			if stats.BestScoreVariant6 != maxScoreForThisVariant {
				text += line + "6-player\n"
				totalMaxScores++
			}
		*/
	}

	// Edit in the max scores
	maxScoresText := strconv.Itoa(totalMaxScores) + " / " + strconv.Itoa(len(variantDefinitions)*4)
	text = strings.Replace(text, "Total max scores:", "Total max scores: "+maxScoresText, 1)

	// Return the missing scores to the client
	if _, err := fmt.Fprintf(w, text); err != nil {
		log.Error("Failed to write out the missing scores text:", err)
		http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
		return
	}
}
