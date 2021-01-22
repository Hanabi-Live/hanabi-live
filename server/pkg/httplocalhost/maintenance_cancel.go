package httplocalhost

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

func (m *Manager) maintenanceCancel(c *gin.Context) {
	if !m.Dispatcher.Core.MaintenanceMode() {
		msg := "The server is not in maintenance mode, so you cannot unmaintenance it."
		c.String(http.StatusBadRequest, msg)
		return
	}

	m.Dispatcher.Core.SetMaintenance(false)
	c.String(http.StatusOK, "success\n")
}
