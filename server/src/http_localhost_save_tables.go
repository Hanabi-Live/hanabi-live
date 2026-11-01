package main

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

func httpLocalhostSaveTables(c *gin.Context) {
	if !serializeTables() {
		c.String(http.StatusInternalServerError, "Failed to save ongoing tables; check the server log.\n")
		return
	}
	c.String(http.StatusOK, "success\n")
}
