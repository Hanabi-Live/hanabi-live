package httplocalhost

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

func uptime(c *gin.Context) {
	// TODO
	/*
		// Local variables
		w := c.Writer

		cameOnline := getCameOnline()
		var uptime string
		if v, err := getUptime(); err != nil {
			hLog.Errorf("Failed to get the uptime: %v", err)
			http.Error(
				w,
				http.StatusText(http.StatusInternalServerError),
				http.StatusInternalServerError,
			)
			return
		} else {
			uptime = v
		}

		msg := fmt.Sprintf("%v\n%v\n", cameOnline, uptime)
	*/

	msg := ""
	c.String(http.StatusOK, msg)
}
