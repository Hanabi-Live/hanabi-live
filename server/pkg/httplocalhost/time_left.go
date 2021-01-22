package httplocalhost

import (
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"
)

func (m *Manager) timeLeft(c *gin.Context) {
	var timeLeft string
	if v, err := m.Dispatcher.Core.GetShutdownTimeLeft(); err != nil {
		msg := fmt.Sprintf("Failed to get the time left: %v", err)
		m.logger.Error(msg)
		c.String(http.StatusInternalServerError, msg)
		return
	} else {
		timeLeft = v
	}
	timeLeft += "\n"

	c.String(http.StatusOK, timeLeft)
}
