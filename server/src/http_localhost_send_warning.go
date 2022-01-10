package main

import (
	"fmt"
	"net/http"
	"strconv"

	"github.com/Hanabi-Live/hanabi-live/logger"
	"github.com/gin-gonic/gin"
)

func httpLocalhostSendWarning(c *gin.Context, userID int) {
	// Validate that the admin sent a message
	msg := c.PostForm("msg")
	if msg == "" {
		c.String(http.StatusOK, "You must send a \"msg\" POST parameter.\n")
		return
	}

	if s, ok := sessions.Get(userID); !ok {
		msg2 := "Failed to get the session for the user ID of \"" + strconv.Itoa(userID) + "\"."
		logger.Error(msg2)
		c.String(http.StatusInternalServerError, msg2)
	} else {
		s.Warning(msg)
		c.String(http.StatusOK, "success\n")
	}
}

func httpLocalhostSendWarningAll(c *gin.Context) {
	// Validate that the admin sent a message
	msg := c.PostForm("msg")
	if msg == "" {
		c.String(http.StatusOK, "You must send a \"msg\" POST parameter.\n")
		return
	}

	// Get all user ID currently present
	users := make([]int, 0)
	fmt.Println("")
	sessions.mutex.RLock()
	for _, s := range sessions.sessions {
		users = append(users, s.UserID)
	}
	sessions.mutex.RUnlock()

	if len(users) == 0 {
		c.String(http.StatusOK, "No users found online\n")
		return
	}

	// Send each user a warning
	success := 0
	for _, id := range users {
		if s, ok := sessions.Get(id); !ok {
			msg2 := "Failed to get the session for the user ID of \"" + strconv.Itoa(id) + "\"."
			logger.Error(msg2)
		} else {
			s.Warning(msg)
			success++
		}
	}

	c.String(http.StatusOK, "Message sent to "+strconv.Itoa(success)+
		" out of "+strconv.Itoa(len(users))+" found online.")
}
