package main

import (
	"net/http"
	"path"

	"github.com/gin-gonic/gin"
)

func httpHome(c *gin.Context) {
	// Local variables
	r := c.Request
	w := c.Writer

	index := path.Join("views", "index.html")
	http.ServeFile(w, r, index)
}
