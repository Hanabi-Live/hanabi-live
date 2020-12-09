package httpmain

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/Zamiell/hanabi-live/server/pkg/models"
	"github.com/gin-gonic/gin"
)

func history(c *gin.Context) {
	// Local variables
	w := c.Writer

	// Parse the player name(s) from the URL
	var playerIDs []int
	var playerNames []string
	if v1, v2, ok := parsePlayerNames(c); !ok {
		return
	} else {
		playerIDs = v1
		playerNames = v2
	}

	// Get the game IDs for this player (or set of players)
	var gameIDs []int
	if v, err := hModels.Games.GetGameIDsMultiUser(c, playerIDs); err != nil {
		hLogger.Errorf(
			"Failed to get the game IDs for the player IDs of [%v]: %v",
			strings.Join(playerNames, ", "),
			err,
		)
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
	var gameHistoryList []*models.GameHistory
	if v, err := hModels.Games.GetHistory(c, gameIDs); err != nil {
		hLogger.Errorf("Failed to get the games from the database: %v", err)
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

	data := &TemplateData{ // nolint: exhaustivestruct
		Title:   "History",
		Name:    playerNames[0],
		History: gameHistoryList,
	}
	if len(playerNames) > 1 {
		data.NamesTitle = fmt.Sprintf("Game History for [%v]", strings.Join(playerNames, ", "))
	}
	serveTemplate(w, data, "profile", "history")
}
