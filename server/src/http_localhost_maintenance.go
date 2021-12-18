package main

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

func httpLocalhostMaintenance(c *gin.Context) {
	if maintenanceMode.IsSet() {
		http.Error(c.Writer, "The server is already in maintenance mode.", http.StatusBadRequest)
		return
	}

	maintenance(c, true)
	c.String(http.StatusOK, "success\n")
}
