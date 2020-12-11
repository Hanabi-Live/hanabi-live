package httplocalhost

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

func (m *Manager) maintenance(c *gin.Context) {
	// TODO
	/*
		// Local variables
		w := c.Writer

		if maintenanceMode.IsSet() {
			http.Error(w, "The server is already in maintenance mode.", http.StatusBadRequest)
			return
		}

		maintenance(c, true)
	*/

	c.String(http.StatusOK, "success\n")
}
