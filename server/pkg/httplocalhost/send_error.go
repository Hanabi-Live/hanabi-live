package httplocalhost

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

func sendError(c *gin.Context, userID int) {
	// Validate that the admin sent a message
	msg := c.PostForm("msg")
	if msg == "" {
		c.String(http.StatusOK, "You must send a \"msg\" POST parameter.\n")
		return
	}

	// TODO
	/*
		if s, ok := sessions2.Get(userID); !ok {
			msg2 := fmt.Sprintf("Failed to get the session for user ID: %v", userID)
			hLog.Error(msg2)
			c.String(http.StatusInternalServerError, msg2)
		} else {
			s.Error(msg)
			c.String(http.StatusOK, "success\n")
		}
	*/
}
