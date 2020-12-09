package httplocalhost

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

func print(c *gin.Context) {
	// TODO
	// print(c)
	c.String(http.StatusOK, "success\n")
}
