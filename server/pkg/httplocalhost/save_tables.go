package httplocalhost

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

func (m *Manager) saveTables(c *gin.Context) {
	// TODO
	// serializeTables()
	c.String(http.StatusOK, "success\n")
}
