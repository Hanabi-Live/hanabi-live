package main

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

func httpLocalhostSaveTables(c *gin.Context) {
	c.String(http.StatusGone, "Emergency table saves are retired; no save was performed. "+
		"Accepted progress uses continuous PostgreSQL recovery. "+
		"Use /gracefulRestart for planned maintenance or recovery of frozen tables.\n")
}
