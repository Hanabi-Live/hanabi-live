package main

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

func httpLocalhostBan(c *gin.Context, username string, ip string, userID int) {
	// Local variables
	w := c.Writer

	// Check to see if this IP is already banned
	if banned, err := models.BannedIPs.Check(ip); err != nil {
		logger.Error("Failed to check to see if the IP \""+ip+"\" is banned:", err)
		http.Error(
			w,
			http.StatusText(http.StatusInternalServerError),
			http.StatusInternalServerError,
		)
		return
	} else if banned {
		c.String(http.StatusOK, "User \""+username+"\" has an IP of \""+ip+"\", "+
			"but it is already banned.\n")
		return
	}

	// Insert a new row in the database for this IP
	if err := models.BannedIPs.Insert(ip, userID); err != nil {
		logger.Error("Failed to insert the banned IP row:", err)
		http.Error(
			w,
			http.StatusText(http.StatusInternalServerError),
			http.StatusInternalServerError,
		)
		return
	}

	logoutUser(userID)

	c.String(http.StatusOK, "success\n")
}
