package main

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

func httpLocalhostSaveTables(c *gin.Context) {
	serializeTables()
	c.String(http.StatusOK, "success\n")
}
