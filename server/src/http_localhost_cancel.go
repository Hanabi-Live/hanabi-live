package main

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

func httpLocalhostCancel(c *gin.Context) {
	if shuttingDown.IsNotSet() {
		http.Error(
			c.Writer,
			"The server is not shutting down, so you cannot cancel it.",
			http.StatusBadRequest,
		)
		return
	}

	cancel(c)
	c.String(http.StatusOK, "success\n")
}
