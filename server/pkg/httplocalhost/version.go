package httplocalhost

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

func (m *Manager) version(c *gin.Context) {
	// TODO
	gitCommitOnStart := ""
	c.String(http.StatusOK, gitCommitOnStart+"\n")
}
