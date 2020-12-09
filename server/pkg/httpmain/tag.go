package httpmain

import (
	"fmt"
	"net/http"

	"github.com/Zamiell/hanabi-live/server/pkg/models"
	"github.com/gin-gonic/gin"
)

func tag(c *gin.Context) {
	// Local variables
	w := c.Writer

	// Parse the tag from the URL
	tag := c.Param("tag")
	if tag == "" {
		http.Error(w, "Error: You must specify a tag.", http.StatusNotFound)
		return
	}

	// Sanitize, validate, and normalize the tag
	if v, err := sanitizeTag(tag); err != nil {
		// sanitizeTag returns a properly formatted error for the end-user
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	} else {
		tag = v
	}

	// Get the game IDs that match this tag
	var gameIDs []int
	if v, err := models.GameTags.SearchByTag(tag); err != nil {
		hLog.Errorf("Failed to search for games matching a tag of \"%v\": %v", tag, err)
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
		hLog.Errorf("Failed to get the games from the database: %v", err)
		http.Error(
			w,
			http.StatusText(http.StatusInternalServerError),
			http.StatusInternalServerError,
		)
		return
	} else {
		gameHistoryList = v
	}

	data := &TemplateData{ // nolint: exhaustivestruct
		Title:      "History",
		NamesTitle: fmt.Sprintf("Games With a Tag of: %v", tag),
		History:    gameHistoryList,
	}
	httpServeTemplate(w, data, "profile", "history")
}
