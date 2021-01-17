package httpmain

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"

	"github.com/Zamiell/hanabi-live/server/pkg/util"
	gsessions "github.com/gin-contrib/sessions"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v4"
	"nhooyr.io/websocket"
)

// ws handles part 2 of 2 for login authentication. (Part 1 is found in "login.go".)
// After receiving a cookie in part 1, the client will attempt to open a WebSocket connection with
// the cookie (which is done implicitly because JavaScript will automatically use any current
// cookies for the website when establishing a WebSocket connection).
// So, before allowing anyone to open a WebSocket connection, we need to validate that they have
// gone through part 1 (e.g. they have a valid cookie that was created at some point in the past).
// We also do some other checks to be thorough.
// If all of the checks pass, the WebSocket connection will be established,
// and then handed off to the sessions manager to reading/writing.
// If anything fails in this function, we want to delete the user's cookie in order to force them to
// start authentication from the beginning.
func (m *Manager) ws(c *gin.Context) {
	// Local variables
	r := c.Request
	w := c.Writer

	// Parse the IP address
	var ip string
	if v, _, err := net.SplitHostPort(r.RemoteAddr); err != nil {
		msg := fmt.Sprintf("Failed to parse the IP address from \"%v\": %v", r.RemoteAddr, err)
		m.wsError(c, msg)
		return
	} else {
		ip = v
	}

	// Check to see if their IP is banned
	if banned, err := m.models.BannedIPs.Check(c, ip); err != nil {
		msg := fmt.Sprintf("Failed to check to see if the IP \"%v\" is banned: %v", ip, err)
		m.wsError(c, msg)
		return
	} else if banned {
		m.logger.Infof("IP \"%v\" tried to establish a WebSocket connection, but they are banned.", ip)
		http.Error(
			w,
			"Your IP address has been banned. Please contact an administrator if you think this is a mistake.",
			http.StatusUnauthorized,
		)
		m.deleteCookie(c)
		return
	}

	// If they have a valid cookie, it should have the "userID" value that we set in "httpLogin()"
	session := gsessions.Default(c)
	var userID int
	if v := session.Get("userID"); v == nil {
		msg := fmt.Sprintf(
			"Unauthorized WebSocket handshake detected from \"%v\". This likely means that their cookie has expired.",
			ip,
		)
		m.wsDeny(c, msg)
		return
	} else {
		userID = v.(int)
	}

	// Get the username for this user
	var username string
	if v, err := m.models.Users.GetUsername(c, userID); errors.Is(err, pgx.ErrNoRows) {
		// The user has a cookie for a user that does not exist in the database
		// (e.g. an "orphaned" user)
		// This can happen in situations where a test user was deleted, for example
		// Delete their cookie and force them to re-login
		msg := fmt.Sprintf(
			"User from \"%v\" tried to login with an orphaned user ID of %v. Deleting their cookie.",
			ip,
			userID,
		)
		m.wsDeny(c, msg)
		return
	} else if err != nil {
		msg := fmt.Sprintf(
			"Failed to get the username from user ID %v: %v",
			userID,
			err,
		)
		m.wsError(c, msg)
		return
	} else {
		username = v
	}

	m.wsNew(c, userID, username, ip)
}

func (m *Manager) wsNew(c *gin.Context, userID int, username string, ip string) {
	// Local variables
	r := c.Request
	w := c.Writer

	// Update the database with "datetime_last_login" and "last_ip"
	if err := m.models.Users.Update(c, userID, ip); err != nil {
		msg := fmt.Sprintf(
			"Failed to set \"datetime_last_login\" and \"last_ip\" for %v: %v",
			util.PrintUser(userID, username),
			err,
		)
		m.wsError(c, msg)
		return
	}

	// Upgrade the HTTP request to a WebSocket connection
	var conn *websocket.Conn
	if v, err := websocket.Accept(w, r, nil); err != nil {
		msg := fmt.Sprintf(
			"Failed to establish the WebSocket connection for %v: %v",
			util.PrintUser(userID, username),
			err,
		)
		m.wsError(c, msg)
		return
	} else {
		conn = v
	}
	defer conn.Close(websocket.StatusInternalError, "")

	// Convert the Gin context to a normal context
	ctx := context.Context(c)

	// Send a request to add the WebSocket connection to the sessions manager
	// (which listens on a separate goroutine)
	// This will block until an error is received from the channel
	err := m.Dispatcher.Sessions.New(ctx, conn, userID, username, ip)
	if errors.Is(err, context.Canceled) ||
		websocket.CloseStatus(err) == websocket.StatusNormalClosure ||
		websocket.CloseStatus(err) == websocket.StatusGoingAway {

		// The WebSocket connection was closed in a normal/expected way
		return
	} else if err != nil {
		m.logger.Errorf(
			"The WebSocket connection for %v encountered an unknown error: %v",
			util.PrintUser(userID, username),
			err,
		)
		return
	}
}

func (m *Manager) wsError(c *gin.Context, msg string) {
	// Local variables
	w := c.Writer

	m.logger.Error(msg)
	http.Error(
		w,
		http.StatusText(http.StatusInternalServerError),
		http.StatusInternalServerError,
	)
	m.deleteCookie(c)
}

func (m *Manager) wsDeny(c *gin.Context, msg string) {
	// Local variables
	w := c.Writer

	m.logger.Info(msg)
	http.Error(
		w,
		http.StatusText(http.StatusUnauthorized),
		http.StatusUnauthorized,
	)
	m.deleteCookie(c)
}
