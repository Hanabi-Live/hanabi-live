// nolint: dupl
package httplocalhost

import (
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"
)

func (m *Manager) ban(c *gin.Context, username string, ip string, userID int) {
	// Local variables
	w := c.Writer

	// Check to see if this IP is already banned
	if banned, err := m.models.BannedIPs.Check(c, ip); err != nil {
		m.logger.Errorf("Failed to check to see if the IP \"%v\" is banned: %v", ip, err)
		http.Error(
			w,
			http.StatusText(http.StatusInternalServerError),
			http.StatusInternalServerError,
		)
		return
	} else if banned {
		msg := fmt.Sprintf(
			"User \"%v\" has an IP of \"%v\", but it is already banned.\n",
			username,
			ip,
		)
		c.String(http.StatusOK, msg)
		return
	}

	// Insert a new row in the database for this IP
	if err := m.models.BannedIPs.Insert(c, ip, userID); err != nil {
		m.logger.Errorf("Failed to insert the banned IP row: %v", err)
		http.Error(
			w,
			http.StatusText(http.StatusInternalServerError),
			http.StatusInternalServerError,
		)
		return
	}

	m.Dispatcher.Sessions.Logout(userID, username)

	c.String(http.StatusOK, "success\n")
}
