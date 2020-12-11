package httplocalhost

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

func (m *Manager) shutdown(c *gin.Context) {
	// TODO
	/*
		// Local variables
		w := c.Writer

		if shuttingDown.IsSet() {
			http.Error(w, "The server is already shutting down.", http.StatusBadRequest)
			return
		}

		shutdown(c)
	*/

	c.String(http.StatusOK, "success\n")
}
