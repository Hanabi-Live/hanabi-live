package httplocalhost

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

func version(c *gin.Context) {
	// TODO
	gitCommitOnStart := ""
	c.String(http.StatusOK, gitCommitOnStart+"\n")
}
