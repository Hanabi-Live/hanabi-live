package httplocalhost

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

func (m *Manager) sendWarning(c *gin.Context, userID int) {
	// Validate that the admin sent a message
	msg := c.PostForm("msg")
	if msg == "" {
		c.String(http.StatusOK, "You must send a \"msg\" POST parameter.\n")
		return
	}

	m.Dispatcher.Sessions.NotifyWarning(userID, msg)
	c.String(http.StatusOK, "success\n")
}
