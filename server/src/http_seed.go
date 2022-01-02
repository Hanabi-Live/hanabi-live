package main

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

func httpSeed(c *gin.Context) {
	// Parse the seed from the URL
	seed := c.Param("seed")
	if seed == "" {
		http.Error(c.Writer, "Error: You must specify a seed.", http.StatusNotFound)
		return
	}

	data := &TemplateData{ // nolint: exhaustivestruct
		Title:        "History",
		NamesTitle:   "seed: " + seed,
		Seed:         seed,
		SpecificSeed: true,
	}
	httpServeTemplate(c.Writer, data, "players_history", "history")
}
