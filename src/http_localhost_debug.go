package main

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

func httpLocalhostDebug(c *gin.Context) {
	debugFunction()
	c.String(http.StatusOK, "success\n")
}
