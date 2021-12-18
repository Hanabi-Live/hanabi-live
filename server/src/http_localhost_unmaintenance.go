package main

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

func httpLocalhostUnmaintenance(c *gin.Context) {
	if maintenanceMode.IsNotSet() {
		http.Error(
			c.Writer,
			"The server is not in maintenance mode, so you cannot unmaintenance it.",
			http.StatusBadRequest,
		)
		return
	}

	maintenance(c, false)
	c.String(http.StatusOK, "success\n")
}
