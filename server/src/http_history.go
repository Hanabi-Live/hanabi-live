package main

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

func httpHistory(c *gin.Context) {
	// Local variables
	w := c.Writer

	// Parse the player name(s) from the URL
	var playerIDs []int
	var playerNames []string
	if v1, v2, ok := httpParsePlayerNames(c); !ok {
		return
	} else {
		playerIDs = v1
		playerNames = v2
	}

	// Get the game IDs for this player (or set of players)
	var gameIDs []int
	if v, err := models.Games.GetGameIDsMultiUser(playerIDs); err != nil {
		logger.Error("Failed to get the game IDs for the players of "+
			"\""+strings.Join(playerNames, ", ")+"\":", err)
		http.Error(
			w,
			http.StatusText(http.StatusInternalServerError),
			http.StatusInternalServerError,
		)
		return
	} else {
		gameIDs = v
	}

	// Get the games corresponding to these IDs
	var gameHistoryList []*GameHistory
	if v, err := models.Games.GetHistory(gameIDs); err != nil {
		logger.Error("Failed to get the games from the database:", err)
		http.Error(
			w,
			http.StatusText(http.StatusInternalServerError),
			http.StatusInternalServerError,
		)
		return
	} else {
		gameHistoryList = v
	}

	if _, ok := c.Request.URL.Query()["api"]; ok {
		c.JSON(http.StatusOK, gameHistoryList)
		return
	}

	data := TemplateData{
		Title:   "History",
		Name:    playerNames[0],
		History: gameHistoryList,
	}
	if len(playerNames) > 1 {
		data.NamesTitle = "Game History for [" + strings.Join(playerNames, ", ") + "]"
	}
	httpServeTemplate(w, data, "profile", "history")
}
