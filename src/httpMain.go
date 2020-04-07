package main

import (
	"io/ioutil"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

func httpMain(c *gin.Context) {
	// Local variables
	w := c.Writer

	// Get the version number of the client (which is the number of commits in the repository)
	var versionString string
	if v, err := ioutil.ReadFile(versionPath); err != nil {
		logger.Error("Failed to read the \""+versionPath+"\" file:", err)
		http.Error(
			w,
			http.StatusText(http.StatusInternalServerError),
			http.StatusInternalServerError,
		)
		return
	} else {
		versionString = string(v)
		versionString = strings.TrimSpace(versionString)
	}

	data := TemplateData{
		Title:   "Main",
		Domain:  domain,
		Version: versionString,
		Dev:     strings.HasPrefix(c.FullPath(), "/dev"),
	}
	httpServeTemplate(w, data, "main")
}
