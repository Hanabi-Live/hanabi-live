package httpmain

import (
	"net/http"
	"sort"
	"strings"

	"github.com/Zamiell/hanabi-live/server/pkg/models"
	"github.com/gin-gonic/gin"
)

func tags(c *gin.Context) {
	// Local variables
	w := c.Writer

	var user models.User
	if v, ok := parsePlayerName(c); !ok {
		return
	} else {
		user = v
	}

	// Search through the database for tags matching this user ID
	var gamesMap map[int][]string
	if v, err := hModels.GameTags.SearchByUserID(c, user.ID); err != nil {
		hLogger.Errorf("Failed to search for games matching a user ID of %v: %v", user.ID, err)
		http.Error(
			w,
			http.StatusText(http.StatusInternalServerError),
			http.StatusInternalServerError,
		)
		return
	} else {
		gamesMap = v
	}

	// Get the keys of the map
	// https://stackoverflow.com/questions/21362950/getting-a-slice-of-keys-from-a-map
	gameIDs := make([]int, len(gamesMap))
	i := 0
	for k := range gamesMap {
		gameIDs[i] = k
		i++
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

	// Attach the tags to each GameHistory object
	// (they do not normally come from the database with the tags on them)
	for _, gameHistory := range gameHistoryList {
		if tags, ok := gamesMap[gameHistory.ID]; ok {
			sort.Strings(tags)
			gameHistory.Tags = strings.Join(tags, ", ")
		}
	}

	data := &TemplateData{ // nolint: exhaustivestruct
		Title:   "Tagged Games",
		Name:    user.Username,
		History: gameHistoryList,
		Tags:    gamesMap,
	}
	serveTemplate(w, data, "profile", "history")
}
