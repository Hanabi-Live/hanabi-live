package main

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

func httpLocalhostTimeLeft(c *gin.Context) {
	// Local variables
	w := c.Writer

	var timeLeft string
	if v, err := getTimeLeft(); err != nil {
		logger.Error("Failed to get the time left:", err)
		http.Error(
			w,
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
