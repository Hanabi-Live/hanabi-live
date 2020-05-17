package main

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

func httpLocalhostVersion(c *gin.Context) {
	c.String(http.StatusOK, gitCommitOnStart+"\n")
}
