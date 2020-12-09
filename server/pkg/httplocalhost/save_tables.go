package httplocalhost

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

func saveTables(c *gin.Context) {
	// TODO
	// serializeTables()
	c.String(http.StatusOK, "success\n")
}
