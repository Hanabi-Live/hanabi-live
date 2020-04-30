package main

import (
	"net"
	"net/http"
	"time"

	gsessions "github.com/gin-contrib/sessions"
	"github.com/gin-gonic/gin"
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
func httpWS(c *gin.Context) {
	// Local variables
	w := c.Writer
	r := c.Request

	// Parse the IP address
	var ip string
	if v, _, err := net.SplitHostPort(r.RemoteAddr); err != nil {
		logger.Error("Failed to parse the IP address in the WebSocket function:", err)
		http.Error(
			w,
			http.StatusText(http.StatusInternalServerError),
			http.StatusInternalServerError,
		)
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
		return
	} else {
		muted = v
	}

	// If they have logged in, their cookie should have values that we set in httpLogin.go
	session := gsessions.Default(c)
	var userID int
	if v := session.Get("userID"); v == nil {
		logger.Info("Unauthorized WebSocket handshake detected from \"" + ip + "\" " +
			"(failed userID check). (This likely means that the cookie has expired.)")
		http.Error(
			w,
			http.StatusText(http.StatusUnauthorized),
			http.StatusUnauthorized,
		)
		return
	} else {
		userID = v.(int)
	}
	var username string
	if v := session.Get("username"); v == nil {
		logger.Error("Unauthorized WebSocket handshake detected from \"" + ip + "\" " +
			"(failed username check).")
		http.Error(w, http.StatusText(http.StatusUnauthorized), http.StatusUnauthorized)
		return
	} else {
		username = v.(string)
	}
	var admin bool
	if v := session.Get("admin"); v == nil {
		logger.Error("Unauthorized WebSocket handshake detected from \"" + ip + "\" " +
			"(failed admin check).")
		http.Error(w, http.StatusText(http.StatusUnauthorized), http.StatusUnauthorized)
		return
	} else {
		admin = v.(bool)
	}
	var firstTimeUser bool
	if v := session.Get("firstTimeUser"); v == nil {
		logger.Error("Unauthorized WebSocket handshake detected from \"" + ip + "\" " +
			"(failed firstTimeUser check).")
		http.Error(w, http.StatusText(http.StatusUnauthorized), http.StatusUnauthorized)
		return
	} else {
		firstTimeUser = v.(bool)
	}

	// Check for sessions that belong to orphaned accounts
	if exists, user, err := models.Users.Get(username); err != nil {
		logger.Error("Failed to get user \""+username+"\":", err)
		http.Error(
			w,
			http.StatusText(http.StatusInternalServerError),
			http.StatusInternalServerError,
		)
		return
	} else if !exists {
		logger.Error("User \"" + username + "\" does not exist in the database; " +
			"they are trying to establish a WebSocket connection with an orphaned account.")
		http.Error(w, http.StatusText(http.StatusUnauthorized), http.StatusUnauthorized)
		return
	} else if userID != user.ID {
		logger.Error("User \"" + username + "\" exists in the database, " +
			"but they are trying to establish a WebSocket connection with an account ID that" +
			"does not match the ID in the database.")
		http.Error(w, http.StatusText(http.StatusUnauthorized), http.StatusUnauthorized)
		return
	}

	// If they got this far, they are a valid user
	// Transfer the values from the login cookie into WebSocket session variables
	keys := make(map[string]interface{})
	// This is independent of the user and used for disconnection purposes
	keys["sessionID"] = sessionID
	sessionID++
	keys["userID"] = userID
	keys["username"] = username
	keys["admin"] = admin
	keys["muted"] = muted
	keys["firstTimeUser"] = firstTimeUser
	keys["status"] = statusLobby // By default, the user is in the lobby
	keys["inactive"] = false
	keys["fakeUser"] = false
	keys["rateLimitAllowance"] = rateLimitRate
	keys["rateLimitLastCheck"] = time.Now()
	keys["banned"] = false

	// Validation succeeded, so establish the WebSocket connection
	if err := m.HandleRequestWithKeys(w, r, keys); err != nil {
		logger.Error("Failed to establish the WebSocket connection for user \""+username+"\":", err)
		http.Error(
			w,
			http.StatusText(http.StatusInternalServerError),
			http.StatusInternalServerError,
		)
		return
	}

	// Next, the established WebSocket connection will be initialized in "websocketConnect.go"
}
