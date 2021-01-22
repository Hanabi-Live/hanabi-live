package httplocalhost

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

func (m *Manager) maintenance(c *gin.Context) {
	if m.Dispatcher.Core.MaintenanceMode() {
		msg := "The server is already in maintenance mode."
		c.String(http.StatusBadRequest, msg)
		return
	}

	m.Dispatcher.Core.SetMaintenance(true)
	c.String(http.StatusOK, "success\n")
}
