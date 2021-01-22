package httplocalhost

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

func (m *Manager) shutdownCancel(c *gin.Context) {
	if !m.Dispatcher.Core.ShuttingDown() {
		msg := "The server is not shutting down, so you cannot cancel it."
		c.String(http.StatusBadRequest, msg)
		return
	}

	m.Dispatcher.Core.SetShutdown(false)
	c.String(http.StatusOK, "success\n")
}
