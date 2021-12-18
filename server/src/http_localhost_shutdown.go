package main

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

func httpLocalhostShutdown(c *gin.Context) {
	if shuttingDown.IsSet() {
		http.Error(c.Writer, "The server is already shutting down.", http.StatusBadRequest)
		return
	}

	shutdown(c)
	c.String(http.StatusOK, "success\n")
}
