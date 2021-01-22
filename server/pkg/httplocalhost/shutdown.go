package httplocalhost

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

func (m *Manager) shutdown(c *gin.Context) {
	if m.Dispatcher.Core.ShuttingDown() {
		msg := "The server is already shutting down."
		c.String(http.StatusBadRequest, msg)
		return
	}

	m.Dispatcher.Core.SetShutdown(true)
	c.String(http.StatusOK, "success\n")
}
