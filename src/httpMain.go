package main

import (
	"strings"

	"github.com/gin-gonic/gin"
)

func httpMain(c *gin.Context) {
	// Local variables
	w := c.Writer

	data := TemplateData{
		Title:   "Main",
		Domain:  domain,
		Version: getVersion(),
		Dev:     strings.HasPrefix(c.FullPath(), "/dev"),
	}
	httpServeTemplate(w, data, "main")
}
