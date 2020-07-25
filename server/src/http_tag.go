package main

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

func httpTag(c *gin.Context) {
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
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	} else {
		tag = v
	}

	// Get the game IDs that match this tag
	var gameIDs []int
	if v, err := models.GameTags.SearchByTag(tag); err != nil {
		logger.Error("Failed to search for games matching a tag of \""+tag+"\":", err)
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

	data := TemplateData{
		Title:      "History",
		NamesTitle: "Games With a Tag of: " + tag,
		History:    gameHistoryList,
	}
	httpServeTemplate(w, data, "profile", "history")
}
