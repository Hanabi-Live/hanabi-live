package main

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

func httpLocalhostUptime(c *gin.Context) {
	// Local variables
	w := c.Writer

	msg := getCameOnline() + "\n"
	var uptime string
	if v, err := getUptime(); err != nil {
		logger.Error("Failed to get the uptime:", err)
		http.Error(
			w,
			http.StatusText(http.StatusInternalServerError),
			http.StatusInternalServerError,
		)
		return
	} else {
		uptime = v
	}
	msg += uptime + "\n"

	c.String(http.StatusOK, msg)
}
