package main

import (
	"net/http"
	"path"

	"github.com/gin-gonic/gin"
)

func httpMain(c *gin.Context) {
	w := c.Writer
	data := TemplateData{
		Title: "Main",
	}
	httpServeTemplate(w, "main", data)
}

func httpMainDev(c *gin.Context) {
	// Local variables
	r := c.Request
	w := c.Writer

	index := path.Join(projectPath, "src", "views", "index.dev.html")
	http.ServeFile(w, r, index)
}
