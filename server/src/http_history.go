package main

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

func httpHistory(c *gin.Context) {
	// Parse the player name(s) from the URL
	var playerNames []string
	if _, v2, ok := httpParsePlayerNames(c); !ok {
		return
	} else {
		playerNames = v2
	}

	// Redirect if old api is used
	if _, ok := c.Request.URL.Query()["api"]; ok {
		c.Redirect(http.StatusPermanentRedirect, "/api/v1/history/"+strings.Join(playerNames, "/"))
		return
	}

	data := &TemplateData{ // nolint: exhaustivestruct
		Title:         "History",
		Name:          playerNames[0],
		Names:         strings.Join(playerNames, "/"),
		VariantsNames: variantIDMap,
	}
	if len(playerNames) > 1 {
		lastIndex := len(playerNames) - 1
		data.NamesTitle = "Game History for " + strings.Join(playerNames[:lastIndex], ", ") + " and " + playerNames[lastIndex]
	}
	httpServeTemplate(c.Writer, data, "players-history", "history")
}
