package httplocalhost

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

func (m *Manager) cancel(c *gin.Context) {
	// TODO
	/*
		// Local variables
		w := c.Writer

		if shuttingDown.IsNotSet() {
			http.Error(
				w,
				"The server is not shutting down, so you cannot cancel it.",
				http.StatusBadRequest,
			)
			return
		}

		cancel(c)
	*/

	c.String(http.StatusOK, "success\n")
}
