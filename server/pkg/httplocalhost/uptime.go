package httplocalhost

import (
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"
)

func (m *Manager) uptime(c *gin.Context) {
	cameOnline := m.Dispatcher.Core.GetCameOnline()

	var uptime string
	if v, err := m.Dispatcher.Core.GetUptime(); err != nil {
		msg := fmt.Sprintf("Failed to get the uptime: %v", err)
		m.logger.Error(msg)
		c.String(http.StatusInternalServerError, msg)
		return
	} else {
		uptime = v
	}

	msg := fmt.Sprintf("%v\n%v\n", cameOnline, uptime)
	c.String(http.StatusOK, msg)
}
