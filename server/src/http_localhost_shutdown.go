package main

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

func httpLocalhostShutdown(c *gin.Context) {
	// Local variables
	w := c.Writer

	if !shutdown(NewMiscContext("shutdown")) {
		http.Error(w, "The server is already shutting down.", http.StatusBadRequest)
		return
	}

	c.String(http.StatusOK, "success\n")
}
