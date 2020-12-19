package main

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

func httpLocalhostDebugFunction(c *gin.Context) {
	debugFunction(c)
	c.String(http.StatusOK, "success\n")
}
