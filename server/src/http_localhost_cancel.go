package main

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

func httpLocalhostCancel(c *gin.Context) {
	// Local variables
	w := c.Writer

	if shuttingDown.IsNotSet() {
		http.Error(
			w,
			"The server is not shutting down, so you cannot cancel it.",
			http.StatusBadRequest,
		)
		return
	}

	cancel()
	c.String(http.StatusOK, "success\n")
}
