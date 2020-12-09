package httplocalhost

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

func gracefulRestart(c *gin.Context) {
	// We need to call this in a new goroutine or else the return string will never get sent
	// TODO
	// go gracefulRestart(c)
	// Make graceful restart work with channels, streaming IO

	c.String(http.StatusOK, "success\n")
}
