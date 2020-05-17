package main

import (
	"net"
	"net/http"
	"strconv"
	"time"

	gsessions "github.com/gin-contrib/sessions"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v4"
)

var (
	// Start at 1 and increment for every session created
	sessionID = 1
)

// httpWS handles part 2 of 2 for logic authentication
// Part 1 is found in "httpLogin.go"
// After receiving a cookie in part 1, the client will attempt to open a WebSocket connection with
// the cookie (this is done implicitly because JavaScript will automatiaclly use any current cookies
// for the website when establishing a WebSocket connection)
// So, before allowing anyone to open a WebSocket connection, we need to validate that they have
// gone through part 1 (e.g. they have a valid cookie that was created N seconds ago)
// We also do a few other checks to be thorough
// If all of the checks pass, the WebSocket connection will be established,
// and then the user's Hanabi data will be initialized in "websocketConnect.go"
// If anything fails in this function, we want to delete the user's cookie in order to force them to
// start authentication from the beginning
func httpWS(c *gin.Context) {
	// Local variables
	w := c.Writer
	r := c.Request

	// Lock the command mutex for the duration of the function to ensure synchronous execution
	commandMutex.Lock()
	// (we cannot use "defer commandMutex.Unlock()" since this function will not return until the
	// WebSocket connection is terminated)

	// Parse the IP address
	var ip string
	if v, _, err := net.SplitHostPort(r.RemoteAddr); err != nil {
		logger.Error("Failed to parse the IP address in the WebSocket function:", err)
		http.Error(
			w,
			http.StatusText(http.StatusInternalServerError),
			http.StatusInternalServerError,
		)
		deleteCookie(c)
		commandMutex.Unlock()
		return
	} else {
		ip = v
	}

	// Check to see if their IP is banned
	if banned, err := models.BannedIPs.Check(ip); err != nil {
		logger.Error("Failed to check to see if the IP \""+ip+"\" is banned:", err)
		http.Error(
			w,
			http.StatusText(http.StatusInternalServerError),
			http.StatusInternalServerError,
		)
		deleteCookie(c)
		commandMutex.Unlock()
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
		commandMutex.Unlock()
		return
	}

	// Check to see if their IP is muted
	var muted bool
	if v, err := models.MutedIPs.Check(ip); err != nil {
		logger.Error("Failed to check to see if the IP \""+ip+"\" is muted:", err)
		http.Error(
			w,
			http.StatusText(http.StatusInternalServerError),
			http.StatusInternalServerError,
		)
		deleteCookie(c)
		commandMutex.Unlock()
		return
	} else {
		muted = v
	}

	// If they have a valid cookie, it should have the "userID" value that we set in "httpLogin()"
	session := gsessions.Default(c)
	var userID int
	if v := session.Get("userID"); v == nil {
		logger.Info("Unauthorized WebSocket handshake detected from \"" + ip + "\". " +
			"This likely means that their cookie has expired.")
		http.Error(
			w,
			http.StatusText(http.StatusUnauthorized),
			http.StatusUnauthorized,
		)
		deleteCookie(c)
		commandMutex.Unlock()
		return
	} else {
		userID = v.(int)
	}

	// Get the username for this user
	var username string
	if v, err := models.Users.GetUsername(userID); err == pgx.ErrNoRows {
		// The user has a cookie for a user that does not exist in the database,
		// e.g. an "orphaned" user
		// This can happen in situations where a test user was deleted, for example
		// Delete their cookie and force them to relogin
		logger.Info("User from \"" + ip + "\" tried to login with a cookie for an orphaned user " +
			"ID of " + strconv.Itoa(userID) + ". Deleting their cookie.")
		http.Error(
			w,
			http.StatusText(http.StatusUnauthorized),
			http.StatusUnauthorized,
		)
		deleteCookie(c)
		commandMutex.Unlock()
		return
	} else if err != nil {
		logger.Error("Failed to get the username for user "+strconv.Itoa(userID)+":", err)
		http.Error(
			w,
			http.StatusText(http.StatusInternalServerError),
			http.StatusInternalServerError,
		)
		deleteCookie(c)
		commandMutex.Unlock()
		return
	} else {
		username = v
	}

	// If they got this far, they are a valid user
	// Transfer the values from the login cookie into WebSocket session variables
	keys := make(map[string]interface{})
	// This is independent of the user and used for disconnection purposes
	keys["sessionID"] = sessionID
	sessionID++
	keys["userID"] = userID
	keys["username"] = username
	keys["muted"] = muted
	keys["status"] = StatusLobby // By default, the user is in the lobby
	keys["inactive"] = false
	keys["fakeUser"] = false
	keys["rateLimitAllowance"] = rateLimitRate
	keys["rateLimitLastCheck"] = time.Now()
	keys["banned"] = false

	// Validation succeeded; establish the WebSocket connection
	// "HandleRequestWithKeys()" will call the "websocketConnect()" function if successful;
	// further initialization is performed there
	commandMutex.Unlock() // We will acquire the lock again in the "websocketConnect()" function
	if err := m.HandleRequestWithKeys(w, r, keys); err != nil {
		logger.Error("Failed to establish the WebSocket connection for user \""+username+"\":", err)
		http.Error(
			w,
			http.StatusText(http.StatusInternalServerError),
			http.StatusInternalServerError,
		)
		deleteCookie(c)
		return
	}
}
