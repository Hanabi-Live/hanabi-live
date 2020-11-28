package main

import (
	"net/http"
	"os"
	"path"

	"github.com/gin-gonic/gin"
)

func httpMain(c *gin.Context) {
	// Local variables
	w := c.Writer

	// Check to see if we are currently recompiling the client
	compiling := true
	compilingPath := path.Join(projectPath, "compiling_client")
	if _, err := os.Stat(compilingPath); os.IsNotExist(err) {
		compiling = false
	} else if err != nil {
		logger.Error("Failed to check if the \""+compilingPath+"\" file exists:", err)
		http.Error(
			w,
			http.StatusText(http.StatusInternalServerError),
			http.StatusInternalServerError,
		)
		return
	}

	// Unlike the other pages, the main website does not directly display the title
	// Instead, we use this value to store whether or not we will use the WebPack development
	// JavaScript
	title := "Main"
	if _, ok := c.Request.URL.Query()["dev"]; ok {
		title = "Dev"
	}

	data := &TemplateData{ // nolint: exhaustivestruct
		Title:       title,
		Domain:      domain,
		Version:     getVersion(),
		Compiling:   compiling,
		WebpackPort: webpackPort,
	}
	httpServeTemplate(w, data, "main")
}
