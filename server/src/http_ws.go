package main

import (
	"net"
	"net/http"
	"strconv"
	"sync/atomic"

	gsessions "github.com/gin-contrib/sessions"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v4"
)

// httpWS handles part 2 of 2 for logic authentication
// Part 1 is found in "httpLogin.go"
// After receiving a cookie in part 1, the client will attempt to open a WebSocket connection with
// the cookie (this is done implicitly because JavaScript will automatically use any current cookies
// for the website when establishing a WebSocket connection)
// So, before allowing anyone to open a WebSocket connection, we need to validate that they have
// gone through part 1 (e.g. they have a valid cookie that was created at some point in the past)
// We also do some other checks to be thorough
// If all of the checks pass, the WebSocket connection will be established,
// and then the user's website data will be initialized in "websocketConnect.go"
// If anything fails in this function, we want to delete the user's cookie in order to force them to
// start authentication from the beginning
func httpWS(c *gin.Context) {
	// Local variables
	r := c.Request
	w := c.Writer

	// Parse the IP address
	var ip string
	if v, _, err := net.SplitHostPort(r.RemoteAddr); err != nil {
		msg := "Failed to parse the IP address from \"" + r.RemoteAddr + "\":"
		httpWSError(c, msg, err)
		return
	} else {
		ip = v
	}

	// Check to see if their IP is banned
	if banned, err := models.BannedIPs.Check(ip); err != nil {
		msg := "Failed to check to see if the IP \"" + ip + "\" is banned:"
		httpWSError(c, msg, err)
		return
	} else if banned {
		logger.Info("IP \"" + ip + "\" tried to establish a WebSocket connection, " +
			"but they are banned.")
		http.Error(
			w,
			"Your IP address has been banned. "+
				"Please contact an administrator if you think this is a mistake.",
			http.StatusUnauthorized,
		)
		deleteCookie(c)
		return
	}

	// If they have a valid cookie, it should have the "userID" value that we set in "httpLogin()"
	session := gsessions.Default(c)
	var userID int
	if v := session.Get("userID"); v == nil {
		msg := "Unauthorized WebSocket handshake detected from \"" + ip + "\". " +
			"This likely means that their cookie has expired."
		httpWSDeny(c, msg)
		return
	} else {
		userID = v.(int)
	}

	// Get the username for this user
	var username string
	if v, err := models.Users.GetUsername(userID); err == pgx.ErrNoRows {
		// The user has a cookie for a user that does not exist in the database
		// (e.g. an "orphaned" user)
		// This can happen in situations where a test user was deleted, for example
		// Delete their cookie and force them to re-login
		msg := "User from \"" + ip + "\" " +
			"tried to login with a cookie with an orphaned user ID of " + strconv.Itoa(userID) +
			". Deleting their cookie."
		httpWSDeny(c, msg)
		return
	} else if err != nil {
		msg := "Failed to get the username for user " + strconv.Itoa(userID) + ":"
		httpWSError(c, msg, err)
		return
	} else {
		username = v
	}

	// We can attach metadata to a Melody session
	keys := make(map[string]interface{})
	// The session ID is independent of the user and is used for disconnection purposes
	keys["sessionID"] = atomic.AddUint64(&sessionIDCounter, 1)
	// Attach the user ID and username so that we can identify the user in the next step
	keys["userID"] = userID
	keys["username"] = username

	// Validation was successful; establish the WebSocket connection
	// "HandleRequestWithKeys()" will call the "websocketConnect()" function if successful;
	// further initialization is performed there
	// "HandleRequestWithKeys()" is blocking
	// (but that is not a problem because this function is called in a dedicated goroutine)
	if err := melodyRouter.HandleRequestWithKeys(w, r, keys); err != nil {
		// We use "logger.Info()" instead of "logger.Error()" because WebSocket establishment can
		// fail for mundane reasons (e.g. internet dropping)
		logger.Info("Failed to establish the WebSocket connection for user \""+username+"\":", err)
		http.Error(
			w,
			http.StatusText(http.StatusBadRequest),
			http.StatusBadRequest,
		)
		deleteCookie(c)
		return
	}

	// This line will not be reached until the WebSocket connection is closed and/or terminated
}

func httpWSError(c *gin.Context, msg string, err error) {
	// Local variables
	w := c.Writer

	logger.Error(msg, err)
	http.Error(
		w,
		http.StatusText(http.StatusInternalServerError),
		http.StatusInternalServerError,
	)
	deleteCookie(c)
}

func httpWSDeny(c *gin.Context, msg string) {
	// Local variables
	w := c.Writer

	logger.Info(msg)
	http.Error(
		w,
		http.StatusText(http.StatusUnauthorized),
		http.StatusUnauthorized,
	)
	deleteCookie(c)
}
