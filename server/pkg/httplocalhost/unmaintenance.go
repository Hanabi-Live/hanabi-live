package httplocalhost

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

func unmaintenance(c *gin.Context) {
	// TODO
	/*
		// Local variables
		w := c.Writer

		if maintenanceMode.IsNotSet() {
			http.Error(
				w,
				"The server is not in maintenance mode, so you cannot unmaintenance it.",
				http.StatusBadRequest,
			)
			return
		}

		maintenance(c, false)
	*/

	c.String(http.StatusOK, "success\n")
}
