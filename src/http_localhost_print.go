package main

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

func httpLocalhostPrint(c *gin.Context) {
	debugPrint()
	c.String(http.StatusOK, "success\n")
}
