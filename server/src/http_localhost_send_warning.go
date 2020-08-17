package main

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

func httpLocalhostSendWarning(c *gin.Context, userID int) {
	// Validate that the admin sent a message
	msg := c.PostForm("msg")
	if msg == "" {
		c.String(http.StatusOK, "You must send a \"msg\" POST parameter.\n")
		return
	}

	sessionsMutex.RLock()
	s, ok := sessions[userID]
	sessionsMutex.RUnlock()

	if !ok {
		msg2 := "Failed to get the session for the user ID of \"" + strconv.Itoa(userID) + "\"."
		logger.Error(msg2)
		c.String(http.StatusInternalServerError, msg2)
		return
	}

	s.Warning(msg)
	c.String(http.StatusOK, "success\n")
}
