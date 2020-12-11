package httplocalhost

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

func (m *Manager) timeLeft(c *gin.Context) {
	// TODO

	/*
		// Local variables
		w := c.Writer

		var timeLeft string
		if v, err := getTimeLeft(); err != nil {
			hLog.Errorf("Failed to get the time left: %v", err)
			http.Error(
				w,
				http.StatusText(http.StatusInternalServerError),
				http.StatusInternalServerError,
			)
			return
		} else {
			timeLeft = v
		}
		timeLeft += "\n"
	*/
	timeLeft := ""

	c.String(http.StatusOK, timeLeft)
}
