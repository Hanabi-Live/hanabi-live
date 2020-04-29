package main

import (
	"net"
	"net/http"
	"strconv"
	"strings"

	gsessions "github.com/gin-contrib/sessions"
	"github.com/gin-gonic/gin"
	emoji "github.com/tmdvs/Go-Emoji-Utils"
)

const (
	minUsernameLength = 2
	maxUsernameLength = 15
)

// httpLogin handles part 1 of 2 for login authentication
// The user must POST to "/login" with the values of "username", "password", and "version"
// If successful, they will receive a cookie from the server with an expiry of N seconds
// Part 2 is found in "httpWS.go"
func httpLogin(c *gin.Context) {
	// Local variables
	r := c.Request
	w := c.Writer

	// Parse the IP address
	var ip string
	if v, _, err := net.SplitHostPort(r.RemoteAddr); err != nil {
		logger.Error("Failed to parse the IP address in the login function:", err)
		http.Error(
			w,
			http.StatusText(http.StatusInternalServerError),
			http.StatusInternalServerError,
		)
		return
	} else {
		ip = v
	}

	/*
		Validation
	*/

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
		logger.Info("IP \"" + ip + "\" tried to log in, but they are banned.")
		http.Error(
			w,
			"Your IP address has been banned. "+
				"Please contact an administrator if you think this is a mistake.",
			http.StatusUnauthorized,
		)
		return
	}

	// Validate that the user sent the required POST values
	username := c.PostForm("username")
	if username == "" {
		logger.Info("User from IP \"" + ip + "\" tried to log in, " +
			"but they did not provide the \"username\" parameter.")
		http.Error(
			w,
			"You must provide the \"username\" parameter to log in.",
			http.StatusUnauthorized,
		)
		return
	}
	password := c.PostForm("password")
	if password == "" {
		logger.Info("User from IP \"" + ip + "\" tried to log in, " +
			"but they did not provide the \"password\" parameter.")
		http.Error(
			w,
			"You must provide the \"password\" parameter to log in.",
			http.StatusUnauthorized,
		)
		return
	}
	version := c.PostForm("version")
	if version == "" {
		logger.Info("User from IP \"" + ip + "\" tried to log in, " +
			"but they did not provide the \"version\" parameter.")
		http.Error(
			w,
			"You must provide the \"version\" parameter to log in.",
			http.StatusUnauthorized,
		)
		return
	}

	// Validate that the username is not excessively short
	if len(username) < minUsernameLength {
		logger.Info("User from IP \"" + ip + "\" tried to log in with a username of " +
			"\"" + username + "\", but it is shorter than " + strconv.Itoa(minUsernameLength) +
			" characters.")
		http.Error(
			w,
			"Usernames must be "+strconv.Itoa(minUsernameLength)+" characters or more.",
			http.StatusUnauthorized,
		)
		return
	}

	// Validate that the username is not excessively long
	if len(username) > maxUsernameLength {
		logger.Info("User from IP \"" + ip + "\" tried to log in with a username of " +
			"\"" + username + "\", but it is longer than " + strconv.Itoa(maxUsernameLength) +
			" characters.")
		http.Error(
			w,
			"Usernames must be "+strconv.Itoa(maxUsernameLength)+" characters or less.",
			http.StatusUnauthorized,
		)
		return
	}

	// Validate that the username does not have any special characters in it
	// (other than underscores, hyphens, and periods)
	if strings.ContainsAny(username, "`~!@#$%^&*()=+[{]}\\|;:'\",<>/?") {
		logger.Info("User from IP \"" + ip + "\" tried to log in with a username of " +
			"\"" + username + "\", but it has illegal special characters in it.")
		http.Error(
			w,
			"Usernames must not contain any special characters other than "+
				"underscores, hyphens, and periods.",
			http.StatusUnauthorized,
		)
		return
	}

	// Validate that the username does not have any emojis in it
	if searchResults := emoji.FindAll(username); len(searchResults) > 0 {
		logger.Info("User from IP \"" + ip + "\" tried to log in with a username of " +
			"\"" + username + "\", but it has emojis in it.")
		http.Error(
			w,
			"Usernames must not contain any emojis.",
			http.StatusUnauthorized,
		)
		return
	}

	// Validate that the version is correct
	// (we want to explicitly disallow clients who are running old versions of the code)
	// But make an exception for bots, who can just use the string of "bot"
	if version != "bot" {
		var versionNum int
		if v, err := strconv.Atoi(version); err != nil {
			logger.Info("User from IP \"" + ip + "\" tried to log in with a username of " +
				"\"" + username + "\", but the submitted version is not an integer.")
			http.Error(
				w,
				"The submitted version must be an integer.",
				http.StatusUnauthorized,
			)
			return
		} else {
			versionNum = v
		}
		currentVersion := getVersion()
		if versionNum != currentVersion {
			logger.Info("User from IP \"" + ip + "\" tried to log in with a username of " +
				"\"" + username + "\" and a version of \"" + version + "\", but this is an old " +
				"version. (The current version is " + strconv.Itoa(currentVersion) + ".)")
			http.Error(
				w,
				"You are running an outdated version of the Hanabi client code.<br />"+
					"(You are on <strong>v"+version+"</strong> and "+
					"the latest is <strong>v"+strconv.Itoa(currentVersion)+"</strong>.)<br />"+
					"Please perform a hard-refresh to get the latest version.<br />"+
					"(Note that a hard-refresh is different from a normal refresh.)<br />"+
					"On Windows, the hotkey for this is: <code>Ctrl + Shift + R</code><br />"+
					"On MacOS, the hotkey for this is: <code>Command + Shift + R</code>",
				http.StatusUnauthorized,
			)
			return
		}
	}

	/*
		Login
	*/

	// Check to see if this username exists in the database
	var exists bool
	var user User
	if v1, v2, err := models.Users.Get(username); err != nil {
		logger.Error("Failed to get user \""+username+"\":", err)
		http.Error(
			w,
			http.StatusText(http.StatusInternalServerError),
			http.StatusInternalServerError,
		)
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

		// Update the database with "datetime_last_login" and "last_ip"
		if err := models.Users.Update(user.ID, ip); err != nil {
			logger.Error("Failed to set the login values for user "+
				"\""+strconv.Itoa(user.ID)+"\":", err)
			http.Error(
				w,
				http.StatusText(http.StatusInternalServerError),
				http.StatusInternalServerError,
			)
			return
		}
	} else {
		// Create the new user in the database
		if v, err := models.Users.Insert(username, password, ip); err != nil {
			logger.Error("Failed to insert user \""+username+"\":", err)
			http.Error(
				w,
				http.StatusText(http.StatusInternalServerError),
				http.StatusInternalServerError,
			)
			return
		} else {
			user = v
		}
	}

	// Save the information to the session cookie
	session := gsessions.Default(c)
	session.Set("userID", user.ID)
	session.Set("username", user.Username)
	session.Set("admin", user.Admin)
	session.Set("firstTimeUser", !exists)
	if err := session.Save(); err != nil {
		logger.Error("Failed to write to the login cookie for user \""+user.Username+"\":", err)
		http.Error(
			w,
			http.StatusText(http.StatusInternalServerError),
			http.StatusInternalServerError,
		)
		return
	}

	// Log the login request and give a "200 OK" HTTP code
	// (returning a code is not actually necessary but Firefox will complain otherwise)
	logger.Info("User \""+user.Username+"\" logged in from:", ip)
	http.Error(w, http.StatusText(http.StatusOK), http.StatusOK)

	// Next, the client will attempt to esbalish a WebSocket connection,
	// which is handled in "httpWS.go"
}
