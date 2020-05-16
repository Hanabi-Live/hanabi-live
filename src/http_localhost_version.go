package main

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

func httpLocalhostVersion(c *gin.Context) {
	c.String(http.StatusOK, strconv.Itoa(startingVersion)+"\n")
}
