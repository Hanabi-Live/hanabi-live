package main

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

func httpLocalhostUnmaintenance(c *gin.Context) {
	// Local variables
	w := c.Writer

	if !maintenanceMode {
		http.Error(
			w,
			"The server is not in maintenance mode, so you cannot unmaintenance it.",
			http.StatusBadRequest,
		)
		return
	}

	maintenance(false)
	c.String(http.StatusOK, "success\n")
}
