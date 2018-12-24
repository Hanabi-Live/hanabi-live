package main

import (
	"net/http"
	"path"

	"github.com/gin-gonic/gin"
)

func httpVideos(c *gin.Context) {
	// Local variables
	r := c.Request
	w := c.Writer

	index := path.Join(projectPath, "src", "views", "videos.html")
	http.ServeFile(w, r, index)
}
