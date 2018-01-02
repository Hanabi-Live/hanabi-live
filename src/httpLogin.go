/*
	This is only part 1 of 2 for login authentication.
	The user must POST to "/login" with the values of "username" and "password".
	If successful, then they will recieve a cookie from the server with an expiry of 5 seconds.
	The client will then attempt to make a WebSocket connection; JavaScript will automatiaclly
	use any current cookies for the website when establishing a WebSocket connection.
	The logic for opening a websocket connection is contained in the "websocketConnect.go" file.
*/

package main

import (
	"net"
	"net/http"
	"strconv"

	"github.com/Zamiell/hanabi-live/src/models"
	gsessions "github.com/gin-contrib/sessions"
	"github.com/gin-gonic/gin"
)

const (
	minUsernameLength = 3
	maxUsernameLength = 15
)

func httpLogin(c *gin.Context) {
	// Local variables
	r := c.Request
	w := c.Writer
	ip, _, _ := net.SplitHostPort(r.RemoteAddr)

	/*
		Validation
	*/

	// Check to see if their IP is banned
	if userIsBanned, err := db.BannedIPs.Check(ip); err != nil {
		log.Error("Failed to check to see if the IP \""+ip+"\" is banned:", err)
		http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
		return
	} else if userIsBanned {
		log.Info("IP \"" + ip + "\" tried to log in, but they are banned.")
		http.Error(w, "Your IP address has been banned. Please contact an administrator if you think this is a mistake.", http.StatusUnauthorized)
		return
	}

	// Check to see if they are already logged in
	// (which should probably never happen since the cookie lasts 5 seconds)
	session := gsessions.Default(c)
	if v := session.Get("userID"); v != nil {
		log.Info("User from IP \"" + ip + "\" tried to get a session cookie, but they are already logged in.")
		http.Error(w, "You are already logged in. Please wait 5 seconds, then try again.", http.StatusUnauthorized)
		return
	}

	// Validate that the user sent a username and password
	username := c.PostForm("username")
	if username == "" {
		log.Error("User from IP \"" + ip + "\" tried to log in, but they did not provide the \"username\" parameter.")
		http.Error(w, "You must provide the \"username\" parameter to log in.", http.StatusUnauthorized)
		return
	}
	password := c.PostForm("password")
	if password == "" {
		log.Error("User from IP \"" + ip + "\" tried to log in, but they did not provide the \"password\" parameter.")
		http.Error(w, "You must provide the \"password\" parameter to log in.", http.StatusUnauthorized)
		return
	}

	// Validate that the username is not excessively short
	if len(username) < minUsernameLength {
		log.Info("User from IP \"" + ip + "\" tried to log in with a username of \"" + username + "\", but it is shorter than " + strconv.Itoa(minUsernameLength) + " characters.")
		http.Error(w, "Usernames must be "+strconv.Itoa(minUsernameLength)+" characters or more.", http.StatusUnauthorized)
		return
	}

	// Validate that the username is not excessively long
	if len(username) > maxUsernameLength {
		log.Info("User from IP \"" + ip + "\" tried to log in with a username of \"" + username + "\", but it is longer than " + strconv.Itoa(maxUsernameLength) + " characters.")
		http.Error(w, "Usernames must be "+strconv.Itoa(maxUsernameLength)+" characters or less.", http.StatusUnauthorized)
		return
	}

	/*
		Login
	*/

	// Check to see if this username exists in the database
	var exists bool
	var user models.User
	if v1, v2, err := db.Users.Get(username); err != nil {
		log.Error("Failed to get user \""+username+"\":", err)
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
		if v, err := db.Users.Insert(username, password); err != nil {
			log.Error("Failed to insert user \""+username+"\":", err)
			http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
			return
		} else {
			user = v
		}
	}

	// Update the database with "datetime_last_login" and "last_ip"
	if err := db.Users.Update(user.ID, ip); err != nil {
		log.Error("Failed to set the login values for user \""+strconv.Itoa(user.ID)+"\":", err)
		http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
		return
	}

	// Save the information to the session
	session.Set("userID", user.ID)
	session.Set("username", user.Username)
	session.Save()

	// Log the login request
	log.Info("User \""+user.Username+"\" logged in from:", ip)
}
