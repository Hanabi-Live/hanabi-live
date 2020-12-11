// nolint: dupl
package httplocalhost

import (
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"
)

func (m *Manager) mute(c *gin.Context, username string, ip string, userID int) {
	// Local variables
	w := c.Writer

	// Check to see if this IP is already muted
	if muted, err := m.models.MutedIPs.Check(c, ip); err != nil {
		m.logger.Errorf("Failed to check to see if the IP \"%v\" is muted: %v", ip, err)
		http.Error(
			w,
			http.StatusText(http.StatusInternalServerError),
			http.StatusInternalServerError,
		)
		return
	} else if muted {
		msg := fmt.Sprintf(
			"User \"%v\" has an IP of \"%v\", but it is already muted.\n",
			username,
			ip,
		)
		c.String(http.StatusOK, msg)
		return
	}

	// Insert a new row in the database for this IP
	if err := m.models.MutedIPs.Insert(c, ip, userID); err != nil {
		m.logger.Errorf("Failed to insert the muted IP row: %v", err)
		http.Error(
			w,
			http.StatusText(http.StatusInternalServerError),
			http.StatusInternalServerError,
		)
		return
	}

	// They need to re-login for the mute to take effect,
	// so disconnect their existing connection, if any
	logoutUser(userID)

	c.String(http.StatusOK, "success\n")
}
