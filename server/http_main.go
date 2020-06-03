package main

import (
	"net/http"
	"os"
	"path"
	"strings"

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

	data := TemplateData{
		Title:     "Main",
		Domain:    domain,
		Version:   getVersion(),
		Compiling: compiling,
		Dev:       strings.HasPrefix(c.FullPath(), "/dev"),
	}
	httpServeTemplate(w, data, "main")
}
