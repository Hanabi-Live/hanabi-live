package main

import (
	"net/http"
	"strconv"

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
	var playerID int
	if exists, v, err := db.Users.Exists(player); err != nil {
		log.Error("Failed to check to see if player \""+player+"\" exists:", err)
		http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
		return
	} else if exists {
		playerID = v
	} else {
		http.Error(w, http.StatusText(http.StatusNotFound), http.StatusNotFound)
		return
	}

	// Get the stats for this player
	var stats models.Stats
	if v, err := db.Users.GetStats(playerID, 0); err != nil {
		log.Error("Failed to get the stats for player \""+strconv.Itoa(playerID)+"\":", err)
		http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
		return
	} else {
		stats = v
	}

	log.Info(stats)

	/*
		// Get the player stats
		playerData, err := db.Users.GetProfileData(playerID)
		if err != nil {
			log.Error("Failed to get player, '" + player + "' data from the database: " + err.Error())
			http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
			return
		}
	*/
}
