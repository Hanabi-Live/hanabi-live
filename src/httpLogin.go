package main

import (
	"net"
	"net/http"
	"strconv"

	"github.com/gin-contrib/sessions"
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
		log.Error("Database error when checking to see if IP \""+ip+"\" was banned:", err)
		http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
		return
	} else if userIsBanned {
		log.Info("IP \"" + ip + "\" tried to log in, but they are banned.")
		http.Error(w, "Your IP address has been banned. Please contact an administrator if you think this is a mistake.", http.StatusUnauthorized)
		return
	}

	// Check to see if they are already logged in
	// (which should probably never happen since the cookie lasts 5 seconds)
	session := sessions.Default(c)
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

	// Validate that the username is not excessively long
	if len(username) > maxUsernameLength {
		log.Info("User from IP \"" + ip + "\" tried to log in with a username of \"" + username + "\", but it is longer than " + strconv.Itoa(maxUsernameLength) + " characters.")
		http.Error(w, "Usernames must be "+strconv.Itoa(maxUsernameLength)+" characters or less.", http.StatusUnauthorized)
		return
	}

	// Validate that the username is not excessively short
	if len(username) < minUsernameLength {
		log.Info("User from IP \"" + ip + "\" tried to log in with a username of \"" + username + "\", but it is shorter than " + strconv.Itoa(minUsernameLength) + " characters.")
		http.Error(w, "Usernames must be "+strconv.Itoa(minUsernameLength)+" characters or more.", http.StatusUnauthorized)
		return
	}

	// Check to see if this username exists in the database
	var sessionValues *models.SessionValues
	if v, err := db.Users.Login(steamID); err != nil {
		log.Error("Database error when checking to see if steam ID "+steamID+" exists:", err)
		http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
		return
	} else if v == nil {
		// This is a new user, so return a success, but don't give them a WebSocket cookie
		// (the client is expected to now make a POST request to "/register")
		http.Error(w, http.StatusText(http.StatusAccepted), http.StatusAccepted)
		return
	} else {
		sessionValues = v
	}

	// Check to see if this user is banned
	if sessionValues.Banned {
		log.Info("User \"" + sessionValues.Username + "\" tried to log in, but they are banned.")
		http.Error(w, "Your user account has been banned. Please contact an administrator if you think this is a mistake.", http.StatusUnauthorized)
		return
	}

	/*
		Login
	*/

	// Update the database with datetime_last_login and last_ip
	if err := db.Users.SetLogin(sessionValues.UserID, ip); err != nil {
		log.Error("Database error when setting the login values:", err)
		http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
		return
	}

	// Save the information to the session
	session.Set("userID", sessionValues.UserID)
	session.Set("username", sessionValues.Username)
	session.Set("admin", sessionValues.Admin)
	session.Set("muted", sessionValues.Muted)
	session.Set("streamURL", sessionValues.StreamURL)
	session.Set("twitchBotEnabled", sessionValues.TwitchBotEnabled)
	session.Set("twitchBotDelay", sessionValues.TwitchBotDelay)
	session.Save()

	// Log the login request
	log.Info("User \""+sessionValues.Username+"\" logged in from:", ip)
}
