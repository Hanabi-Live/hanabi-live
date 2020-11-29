package main

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

func httpLocalhostGracefulRestart(c *gin.Context) {
	// We need to call this in a new goroutine or else the return string will never get sent
	go gracefulRestart(c)

	c.String(http.StatusOK, "success\n")
}
