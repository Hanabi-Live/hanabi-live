package main

import (
	"path"

	"github.com/gin-gonic/gin"
)

func httpNewLobby(c *gin.Context) {
	c.Header("Cache-Control", "no-cache")
	c.File(path.Join(projectPath, "public", "client-new", "index.html"))
}
