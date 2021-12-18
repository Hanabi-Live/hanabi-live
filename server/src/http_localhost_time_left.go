package main

import (
	"net/http"

	"github.com/Zamiell/hanabi-live/logger"
	"github.com/gin-gonic/gin"
)

func httpLocalhostTimeLeft(c *gin.Context) {
	var timeLeft string
	if v, err := getTimeLeft(); err != nil {
		logger.Error("Failed to get the time left: " + err.Error())
		http.Error(
			c.Writer,
			http.StatusText(http.StatusInternalServerError),
			http.StatusInternalServerError,
		)
		return
	} else {
		timeLeft = v
	}
	timeLeft += "\n"

	c.String(http.StatusOK, timeLeft)
}
