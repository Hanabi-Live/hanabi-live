package httplocalhost

import (
	"fmt"
	"net/http"

	"github.com/Zamiell/hanabi-live/server/pkg/util"
	"github.com/gin-gonic/gin"
)

func (m *Manager) userAction(c *gin.Context) {
	// Local variables
	w := c.Writer

	// Validate the username
	username := c.PostForm("username")
	if username == "" {
		http.Error(w, "Error: You must specify a username.", http.StatusBadRequest)
		return
	}

	// Check to see if this username exists in the database
	var userID int
	if exists, v, err := m.models.Users.Get(c, username); err != nil {
		m.logger.Errorf("Failed to get user \"%v\": %v", username, err)
		http.Error(
			w,
			http.StatusText(http.StatusInternalServerError),
			http.StatusInternalServerError,
		)
		return
	} else if !exists {
		msg := fmt.Sprintf("User \"%v\" does not exist in the database.\n", username)
		c.String(http.StatusOK, msg)
		return
	} else {
		userID = v.ID
	}

	// Get the IP for this user
	var lastIP string
	if v, err := m.models.Users.GetLastIP(c, username); err != nil {
		m.logger.Errorf(
			"Failed to get the last IP from the database for %v: %v",
			util.PrintUser(userID, username),
			err,
		)
		return
	} else {
		lastIP = v
	}

	path := c.Request.URL.Path
	if path == "/ban" {
		m.ban(c, username, lastIP, userID)
	} else if path == "/mute" {
		m.mute(c, username, lastIP, userID)
	} else if path == "/sendWarning" {
		m.sendWarning(c, userID)
	} else if path == "/sendError" {
		m.sendError(c, userID)
	} else {
		http.Error(w, "Error: Invalid URL.", http.StatusNotFound)
		return
	}
}
