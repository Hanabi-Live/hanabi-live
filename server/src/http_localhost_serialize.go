package main

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

func httpLocalhostSerialize(c *gin.Context) {
	serializeTables()
	c.String(http.StatusOK, "success\n")
}
