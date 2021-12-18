package main

import (
	"net/http"

	"github.com/Zamiell/hanabi-live/logger"
	"github.com/gin-gonic/gin"
)

func httpLocalhostUptime(c *gin.Context) {
	cameOnline := getCameOnline()
	var uptime string
	if v, err := getUptime(); err != nil {
		logger.Error("Failed to get the uptime: " + err.Error())
		http.Error(
			c.Writer,
			http.StatusText(http.StatusInternalServerError),
			http.StatusInternalServerError,
		)
		return
	} else {
		uptime = v
	}

	msg := cameOnline + "\n" + uptime + "\n"
	c.String(http.StatusOK, msg)
}
