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
// the cookie (this is done implicitly because JavaScript will automatically use any current cookies
// for the website when establishing a WebSocket connection)
// So, before allowing anyone to open a WebSocket connection, we need to validate that they have
// gone through part 1 (e.g. they have a valid cookie that was created at some point in the past)
// We also do a few other checks to be thorough
// If all of the checks pass, the WebSocket connection will be established,
// and then the user's website data will be initialized in "websocketConnect.go"
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
		msg := "Failed to parse the IP address in the WebSocket function:"
		httpWSError(msg, err, c)
		return
	} else {
		ip = v
	}

	// Check to see if their IP is banned
	if banned, err := models.BannedIPs.Check(ip); err != nil {
		msg := "Failed to check to see if the IP \"" + ip + "\" is banned:"
		httpWSError(msg, err, c)
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
		msg := "Failed to check to see if the IP \"" + ip + "\" is muted:"
		httpWSError(msg, err, c)
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
		// Delete their cookie and force them to re-login
		logger.Info("User from \"" + ip + "\" " +
			"tried to login with a cookie with an orphaned user ID of " + strconv.Itoa(userID) + ". " +
			"Deleting their cookie.")
		http.Error(
			w,
			http.StatusText(http.StatusUnauthorized),
			http.StatusUnauthorized,
		)
		deleteCookie(c)
		commandMutex.Unlock()
		return
	} else if err != nil {
		msg := "Failed to get the username for user " + strconv.Itoa(userID) + ":"
		httpWSError(msg, err, c)
		return
	} else {
		username = v
	}

	// Get their friends and reverse friends
	var friendsMap map[int]struct{}
	if v, err := models.UserFriends.GetMap(userID); err != nil {
		msg := "Failed to get the friend map for user \"" + username + "\":"
		httpWSError(msg, err, c)
		return
	} else {
		friendsMap = v
	}
	var reverseFriendsMap map[int]struct{}
	if v, err := models.UserReverseFriends.GetMap(userID); err != nil {
		msg := "Failed to get the reverse friend map for user \"" + username + "\":"
		httpWSError(msg, err, c)
		return
	} else {
		reverseFriendsMap = v
	}

	// If they got this far, they are a valid user
	// Transfer the values from the login cookie into WebSocket session variables
	// New keys added here should also be added to the "newFakeSesssion()" function
	keys := defaultSessionKeys()
	// This is independent of the user and used for disconnection purposes
	keys["sessionID"] = sessionID
	sessionID++
	keys["userID"] = userID
	keys["username"] = username
	keys["muted"] = muted
	keys["friends"] = friendsMap
	keys["reverseFriends"] = reverseFriendsMap

	// Validation succeeded; establish the WebSocket connection
	// "HandleRequestWithKeys()" will call the "websocketConnect()" function if successful;
	// further initialization is performed there
	commandMutex.Unlock() // We will acquire the lock again in the "websocketConnect()" function
	if err := m.HandleRequestWithKeys(w, r, keys); err != nil {
		// We don't use "httpWSError()" since we do not want to unlock the command mutex
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
}

func httpWSError(msg string, err error, c *gin.Context) {
	// Local variables
	w := c.Writer

	logger.Error(msg, err)
	http.Error(
		w,
		http.StatusText(http.StatusInternalServerError),
		http.StatusInternalServerError,
	)
	deleteCookie(c)
	commandMutex.Unlock()
}

func defaultSessionKeys() map[string]interface{} {
	keys := make(map[string]interface{})

	keys["sessionID"] = -1
	keys["userID"] = -1
	keys["username"] = ""
	keys["muted"] = false
	keys["status"] = StatusLobby // By default, new users are in the lobby
	keys["table"] = -1
	keys["friends"] = make(map[int]struct{})
	keys["reverseFriends"] = make(map[int]struct{})
	keys["inactive"] = false
	keys["fakeUser"] = false
	keys["rateLimitAllowance"] = RateLimitRate
	keys["rateLimitLastCheck"] = time.Now()
	keys["banned"] = false

	return keys
}
