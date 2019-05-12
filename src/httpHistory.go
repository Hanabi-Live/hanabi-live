package main

import (
	"net/http"

	"github.com/Zamiell/hanabi-live/src/models"
	"github.com/gin-gonic/gin"
)

type HistoryData struct {
	Title   string
	Header  bool
	Name    string
	History []*models.GameHistory
}

func httpHistory(c *gin.Context) {
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

	// Get the player's entire table history
	var history []*models.GameHistory
	if v, err := db.Games.GetUserHistory(user.ID, 0, 0, true); err != nil {
		log.Error("Failed to get the history for player \""+user.Username+"\":", err)
		return
	} else {
		history = v
	}
	history = historyFillVariants(history)

	/*
		text := ""
		text += "+-------------------+\n"
		text += "| Full Table History |\n"
		text += "+-------------------+\n"
		text += "\n"

		if len(history) == 0 {
			text += "(no tables played)\n"
		}

		for _, t := range history {
			text += "Table #" + strconv.Itoa(t.ID) + "\n"
			text += "- " + strconv.Itoa(t.NumPlayers) + " players\n"
			text += "- Score: " + strconv.Itoa(t.Game.Score) + "\n"
			text += "- Variant: " + t.Variant + "\n"
			text += "- Date: " + t.Game.DatetimeFinished.Format("Mon Jan 02 15:04:05 MST 2006") + "\n"
			// Same as the Linux date command
			text += "- Other players: " + t.OtherPlayerNames + "\n"
			text += "- Other scores: " + strconv.Itoa(t.NumSimilar) + "\n"
			text += "\n"
		}
	*/

	data := HistoryData{
		Title:   "History",
		Name:    user.Username,
		History: history,
	}
	httpServeTemplate(w, data, "profile", "history")
}
