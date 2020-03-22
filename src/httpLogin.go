/*
	This is only part 1 of 2 for login authentication.
	The user must POST to "/login" with the values of "username" and "password".
	If successful, then they will receive a cookie from the server with an expiry of 5 seconds.
	The client will then attempt to make a WebSocket connection; JavaScript will automatiaclly
	use any current cookies for the website when establishing a WebSocket connection.
	The logic for opening a websocket connection is contained in the "websocketConnect.go" file.
*/

package main

import (
	"net"
	"net/http"
	"strconv"
	"strings"

	gsessions "github.com/gin-contrib/sessions"
	"github.com/gin-gonic/gin"
)

const (
	minUsernameLength = 2
	maxUsernameLength = 15
)

func httpLogin(c *gin.Context) {
	// Local variables
	r := c.Request
	w := c.Writer

	// Parse the IP address
	var ip string
	if v, _, err := net.SplitHostPort(r.RemoteAddr); err != nil {
		logger.Error("Failed to parse the IP address in the login function:", err)
		http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
		return
	} else {
		ip = v
	}

	/*
		Validation
	*/

	// Check to see if their IP is banned
	if userIsBanned, err := models.BannedIPs.Check(ip); err != nil {
		logger.Error("Failed to check to see if the IP \""+ip+"\" is banned:", err)
		http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
		return
	} else if userIsBanned {
		logger.Info("IP \"" + ip + "\" tried to log in, but they are banned.")
		http.Error(
			w,
			"Your IP address has been banned. "+
				"Please contact an administrator if you think this is a mistake.",
			http.StatusUnauthorized,
		)
		return
	}

	// Check to see if they are already logged in
	// (which should probably never happen since the cookie lasts 5 seconds)
	session := gsessions.Default(c)
	if v := session.Get("userID"); v != nil {
		logger.Info("User from IP \"" + ip + "\" tried to get a session cookie, but they are already logged in.")
		http.Error(w, "You are already logged in. Please wait 5 seconds, then try again.", http.StatusUnauthorized)
		return
	}

	// Validate that the user sent a username and password
	username := c.PostForm("username")
	if username == "" {
		logger.Error("User from IP \"" + ip + "\" tried to log in, but they did not provide the \"username\" parameter.")
		http.Error(w, "You must provide the \"username\" parameter to log in.", http.StatusUnauthorized)
		return
	}
	password := c.PostForm("password")
	if password == "" {
		logger.Error("User from IP \"" + ip + "\" tried to log in, but they did not provide the \"password\" parameter.")
		http.Error(w, "You must provide the \"password\" parameter to log in.", http.StatusUnauthorized)
		return
	}

	// Validate that the username is not excessively short
	if len(username) < minUsernameLength {
		logger.Info(
			"User from IP \"" + ip + "\" " +
				"tried to log in with a username of \"" + username + "\", " +
				"but it is shorter than " + strconv.Itoa(minUsernameLength) + " characters.",
		)
		http.Error(w, "Usernames must be "+strconv.Itoa(minUsernameLength)+" characters or more.", http.StatusUnauthorized)
		return
	}

	// Validate that the username is not excessively long
	if len(username) > maxUsernameLength {
		logger.Info(
			"User from IP \"" + ip + "\" " +
				"tried to log in with a username of \"" + username + "\", " +
				"but it is longer than " + strconv.Itoa(maxUsernameLength) + " characters.",
		)
		http.Error(w, "Usernames must be "+strconv.Itoa(maxUsernameLength)+" characters or less.", http.StatusUnauthorized)
		return
	}

	// Validate that the username does not have any special characters in it
	// (other than underscores, hyphens, and periods)
	if strings.ContainsAny(username, "`~!@#$%^&*()=+[{]}\\|;:'\",<>/?") {
		logger.Info(
			"User from IP \"" + ip + "\" tried to log in with " +
				"a username of \"" + username + "\", " +
				"but it has illegal special characters in it.",
		)
		http.Error(
			w,
			"Usernames must not contain any special characters other than "+
				"underscores, hyphens, and periods.",
			http.StatusUnauthorized,
		)
		return
	}

	/*
		Login
	*/

	// Check to see if this username exists in the database
	var exists bool
	var user User
	if v1, v2, err := models.Users.Get(username); err != nil {
		logger.Error("Failed to get user \""+username+"\":", err)
		http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
		return
	} else {
		exists = v1
		user = v2
	}

	if exists {
		if password != user.Password {
			http.Error(w, "That is not the correct password.", http.StatusUnauthorized)
			return
		}
	} else {
		// Create the new user in the database
		if v, err := models.Users.Insert(username, password); err != nil {
			logger.Error("Failed to insert user \""+username+"\":", err)
			http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
			return
		} else {
			user = v
		}
	}

	// Update the database with "datetime_last_login" and "last_ip"
	if err := models.Users.Update(user.ID, ip); err != nil {
		logger.Error("Failed to set the login values for user \""+strconv.Itoa(user.ID)+"\":", err)
		http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
		return
	}

	// Save the information to the session cookie
	session.Set("userID", user.ID)
	session.Set("username", user.Username)
	session.Set("admin", user.Admin)
	session.Set("firstTimeUser", !exists)
	if err := session.Save(); err != nil {
		logger.Error("Failed to write to the login cookie for user \""+user.Username+"\":", err)
		http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
		return
	}

	// Log the login request and give a "200 OK" HTTP code
	// (returning a code is not actually necessary but Firefox will complain otherwise)
	logger.Info("User \""+user.Username+"\" logged in from:", ip)
	http.Error(w, http.StatusText(http.StatusOK), http.StatusOK)
}
