package main

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

type HistoryData struct {
	Title   string
	Dev     bool
	Name    string
	History []*GameHistory
}

func httpHistory(c *gin.Context) {
	// Local variables
	w := c.Writer

	// Lock the command mutex for the duration of the function
	// (since we only have one database connection and it is not safe for concurrent uses)
	commandMutex.Lock()
	defer commandMutex.Unlock()

	// Parse the player name from the URL
	player := c.Param("player")
	if player == "" {
		http.Error(w, "Error: You must specify a player.", http.StatusNotFound)
		return
	}
	normalizedUsername := normalizeUsername(player)

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
		return
	} else if exists {
		user = v
	} else {
		http.Error(w, "Error: That player does not exist in the database.", http.StatusNotFound)
		return
	}

	// Get the player's entire game history
	var history []*GameHistory
	if v, err := models.Games.GetUserHistory(user.ID, 0, 0, true); err != nil {
		logger.Error("Failed to get the history for player \""+user.Username+"\":", err)
		http.Error(
			w,
			http.StatusText(http.StatusInternalServerError),
			http.StatusInternalServerError,
		)
		return
	} else {
		history = v
	}
	history = historyFillVariants(history)

	data := HistoryData{
		Title:   "History",
		Dev:     false,
		Name:    user.Username,
		History: history,
	}
	httpServeTemplate(w, data, "profile", "history")
}
