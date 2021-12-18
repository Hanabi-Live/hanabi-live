package main

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

func httpLocalhostMaintenance(c *gin.Context) {
	// Local variables
	w := c.Writer

	if maintenanceMode.IsSet() {
		http.Error(w, "The server is already in maintenance mode.", http.StatusBadRequest)
		return
	}

	maintenance(c, true)
	c.String(http.StatusOK, "success\n")
}
