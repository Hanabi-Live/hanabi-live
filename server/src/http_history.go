package main

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
)

type HistoryData struct {
	Title        string
	Dev          bool
	Name         string
	NamesTitle   string
	History      []*GameHistory
	SpecificSeed bool
}

func httpHistory(c *gin.Context) {
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
				return
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
			return
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
			return
		} else if exists {
			user = v
		} else {
			http.Error(
				w,
				"Error: The player of \""+player+"\" does not exist in the database.",
				http.StatusNotFound,
			)
			return
		}

		playerIDs = append(playerIDs, user.ID)
		playerNames = append(playerNames, user.Username)
		playerNormalizedNames = append(playerNames, normalizedUsername)
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

	data := HistoryData{
		Title:   "History",
		Dev:     false,
		Name:    playerNames[0],
		History: gameHistoryList,
	}
	if len(playerNames) > 1 {
		data.NamesTitle = "Game History for [" + strings.Join(playerNames, ", ") + "]"
	}
	httpServeTemplate(w, data, "profile", "history")
}
