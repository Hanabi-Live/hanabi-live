package main

import (
	"github.com/gin-gonic/gin"
)

func httpMain(c *gin.Context) {
	// Local variables
	w := c.Writer

	data := &TemplateData{ // nolint: exhaustivestruct
		Title:  "Main",
		Domain: domain,
		IsDev:  isDev,
	}
	httpServeTemplate(w, data, "main")
}
