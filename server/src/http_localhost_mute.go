// The "dupl" linter has a false positive with the "http_localhost_ban.go" file
package main // nolint: dupl

import (
	"net/http"

	"github.com/Zamiell/hanabi-live/logger"
	"github.com/gin-gonic/gin"
)

func httpLocalhostMute(c *gin.Context, username string, ip string, userID int) {
	// Local variables
	w := c.Writer

	// Check to see if this IP is already muted
	if muted, err := models.MutedIPs.Check(ip); err != nil {
		logger.Error("Failed to check to see if the IP \"" + ip + "\" is muted: " + err.Error())
		http.Error(
			w,
			http.StatusText(http.StatusInternalServerError),
			http.StatusInternalServerError,
		)
		return
	} else if muted {
		c.String(http.StatusOK, "User \""+username+"\" has an IP of \""+ip+"\", "+
			"but it is already muted.\n")
		return
	}

	// Insert a new row in the database for this IP
	if err := models.MutedIPs.Insert(ip, userID); err != nil {
		logger.Error("Failed to insert the muted IP row: " + err.Error())
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
