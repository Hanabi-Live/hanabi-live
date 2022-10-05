package main

import (
	"crypto/sha256"
	"fmt"
	"net"
	"net/http"
	"strconv"
	"strings"
	"unicode"

	"github.com/Hanabi-Live/hanabi-live/logger"
	"github.com/alexedwards/argon2id"
	gsessions "github.com/gin-contrib/sessions"
	"github.com/gin-gonic/gin"
)

const (
	MinUsernameLength = 2
	MaxUsernameLength = 15
)

type HTTPLoginData struct {
	IP                 string
	Username           string
	Password           string
	NewPassword        string
	NormalizedUsername string
}

// httpLogin handles part 1 of 2 for login authentication
// The user must POST to "/login" with the values of "username", "password", and "version"
// If successful, they will receive a cookie from the server with an expiry of N seconds
// Part 2 is found in "httpWS.go"
//
// By allowing this function to run concurrently with no locking, there is a race condition where
// a new user can login twice at the same time and "models.Users.Insert()" will be called twice
// However, the UNIQUE SQL constraint on the "username" row and the "normalized_username" row will
// prevent the 2nd insersion from completing, and the second goroutine will return at that point
func httpLogin(c *gin.Context) {
	// Local variables
	w := c.Writer

	var data *HTTPLoginData
	if v, success := httpLoginValidate(c); !success {
		return
	} else {
		data = v
	}

	// Check to see if this username exists in the database
	var exists bool
	var user User
	if v1, v2, err := models.Users.Get(data.Username); err != nil {
		logger.Error("Failed to get user \"" + data.Username + "\": " + err.Error())
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
		// First, check to see if they have a a legacy password hash stored in the database
		if user.OldPasswordHash.Valid {
			if ok := httpCheckAndChangeCredentials(w, user, data); !ok {
				return
			}
		} else {
			if ok := httpCheckCredentials(w, user, data); !ok {
				return
			}
		}

		// If they have provided a new password, replace the old one
		if ok := httpCheckPasswordChange(w, user, data); !ok {
			return
		}
	} else {
		if v, ok := httpCreateNewUser(w, data); !ok {
			return
		} else {
			user = v
		}
	}

	// Save the information to the session cookie
	session := gsessions.Default(c)
	session.Set("userID", user.ID)
	if err := session.Save(); err != nil {
		logger.Error("Failed to write to the login cookie for user \"" + user.Username + "\": " +
			err.Error())
		http.Error(
			w,
			http.StatusText(http.StatusInternalServerError),
			http.StatusInternalServerError,
		)
		return
	}

	// Log the login request and give a "200 OK" HTTP code
	// (returning a code is not actually necessary but Firefox will complain otherwise)
	logger.Info("User \"" + user.Username + "\" logged in from: " + data.IP)
	http.Error(w, http.StatusText(http.StatusOK), http.StatusOK)

	// Next, the client will attempt to establish a WebSocket connection,
	// which is handled in "httpWS.go"
}

// Verifies user login using SHA256 and change password hashing to Argon2id
func httpCheckAndChangeCredentials(w http.ResponseWriter, user User, data *HTTPLoginData) bool {
	// This is the first time that they are logging in after the password hash transition
	// Hash the submitted password with SHA256
	passwordSalt := "Hanabi password "
	combined := passwordSalt + data.Password
	oldPasswordHashBytes := sha256.Sum256([]byte(combined))
	oldPasswordHashString := fmt.Sprintf("%x", oldPasswordHashBytes)
	if oldPasswordHashString != user.OldPasswordHash.String {
		http.Error(w, "That is not the correct password.", http.StatusUnauthorized)
		return false
	}

	// Create an Argon2id hash of the plain-text password
	var passwordHash string
	if v, ok := httpPasswordHash(w, data.Password, data.Username); !ok {
		return false
	} else {
		passwordHash = v
	}

	// Update their password to the new Argon2 format
	if err := models.Users.UpdatePassword(user.ID, passwordHash); err != nil {
		logger.Error("Failed to set the new hash for \"" + data.Username + "\": " +
			err.Error())
		http.Error(
			w,
			http.StatusText(http.StatusInternalServerError),
			http.StatusInternalServerError,
		)
		return false
	}
	return true
}

// Verifies user login using Argon2id
func httpCheckCredentials(w http.ResponseWriter, user User, data *HTTPLoginData) bool {
	// Check to see if their password is correct
	if !user.PasswordHash.Valid {
		logger.Error("Failed to get the Argon2 hash from the database for " +
			"\"" + data.Username + "\".")
		http.Error(
			w,
			http.StatusText(http.StatusInternalServerError),
			http.StatusInternalServerError,
		)
		return false
	}
	if match, err := argon2id.ComparePasswordAndHash(
		data.Password,
		user.PasswordHash.String,
	); err != nil {
		logger.Error("Failed to compare the password to the Argon2 hash for " +
			"\"" + data.Username + "\": " + err.Error())
		http.Error(
			w,
			http.StatusText(http.StatusInternalServerError),
			http.StatusInternalServerError,
		)
		return false
	} else if !match {
		http.Error(w, "That is not the correct password.", http.StatusUnauthorized)
		return false
	}
	return true
}

// Checks for password change and saves new hashed password
func httpCheckPasswordChange(w http.ResponseWriter, user User, data *HTTPLoginData) bool {
	if data.NewPassword == "" {
		return true
	}

	var passwordHash string
	if v, ok := httpPasswordHash(w, data.NewPassword, data.Username); !ok {
		return false
	} else {
		passwordHash = v
	}

	// Update the user
	if err := models.Users.ChangePassword(user.ID, passwordHash); err != nil {
		logger.Error("Failed to update user \"" + data.Username + "\" password: " + err.Error())
		http.Error(
			w,
			http.StatusText(http.StatusInternalServerError),
			http.StatusInternalServerError,
		)
		return false
	}
	logger.Info("Password update for user \"" + data.Username + "\"")
	return true
}

// Checks provided data and creates a new user
func httpCreateNewUser(w http.ResponseWriter, data *HTTPLoginData) (User, bool) {
	// Check for empty password and non-empty newPassword
	if data.Password == "" {
		http.Error(
			w,
			"You requested an account creation without providing a password.",
			http.StatusUnauthorized,
		)
		return User{}, false
	}

	if data.NewPassword != "" {
		http.Error(
			w,
			"You requested an account creation. You cannot ask for a password change at the same time.",
			http.StatusUnauthorized,
		)
		return User{}, false
	}

	// Check to see if any other users have a normalized version of this username
	// This prevents username-spoofing attacks and homoglyph usage
	// e.g. "alice" trying to impersonate "Alice"
	// e.g. "Alicé" trying to impersonate "Alice"
	// e.g. "Αlice" with a Greek letter A (0x391) trying to impersonate "Alice"
	if data.NormalizedUsername == "" {
		http.Error(
			w,
			"That username cannot be transliterated to ASCII. "+
				"Please try using a simpler username or try using less special characters.",
			http.StatusUnauthorized,
		)
		return User{}, false
	}
	if normalizedExists, similarUsername, err := models.Users.NormalizedUsernameExists(
		data.NormalizedUsername,
	); err != nil {
		logger.Error("Failed to check for normalized password uniqueness for " +
			"\"" + data.Username + "\": " + err.Error())
		http.Error(
			w,
			http.StatusText(http.StatusInternalServerError),
			http.StatusInternalServerError,
		)
		return User{}, false
	} else if normalizedExists {
		http.Error(
			w,
			"That username is too similar to the existing user of "+"\""+similarUsername+
				"\". If you are sure that this is your username, then please check to make sure "+
				"that you are capitalized your username correctly. If you are logging on for the first time, "+
				"then please choose a different username.",
			http.StatusUnauthorized,
		)
		return User{}, false
	}

	// Create an Argon2id hash of the plain-text password
	var passwordHash string
	if v, err := argon2id.CreateHash(data.Password, argon2id.DefaultParams); err != nil {
		logger.Error("Failed to create a hash from the submitted password for " +
			"\"" + data.Username + "\": " + err.Error())
		http.Error(
			w,
			http.StatusText(http.StatusInternalServerError),
			http.StatusInternalServerError,
		)
		return User{}, false
	} else {
		passwordHash = v
	}

	// Create the new user in the database
	if v, err := models.Users.Insert(
		data.Username,
		data.NormalizedUsername,
		passwordHash,
		data.IP,
	); err != nil {
		logger.Error("Failed to insert user \"" + data.Username + "\": " + err.Error())
		http.Error(
			w,
			http.StatusText(http.StatusInternalServerError),
			http.StatusInternalServerError,
		)
		return User{}, false
	} else {
		return v, true
	}
}

func httpLoginValidate(c *gin.Context) (*HTTPLoginData, bool) {
	// Local variables
	r := c.Request
	w := c.Writer

	// Parse the IP address
	var ip string
	if v, _, err := net.SplitHostPort(r.RemoteAddr); err != nil {
		logger.Error("Failed to parse the IP address from \"" + r.RemoteAddr + "\": " + err.Error())
		http.Error(
			w,
			http.StatusText(http.StatusInternalServerError),
			http.StatusInternalServerError,
		)
		return nil, false
	} else {
		ip = v
	}

	// Check to see if their IP is banned
	if banned, err := models.BannedIPs.Check(ip); err != nil {
		logger.Error("Failed to check to see if the IP \"" + ip + "\" is banned: " + err.Error())
		http.Error(
			w,
			http.StatusText(http.StatusInternalServerError),
			http.StatusInternalServerError,
		)
		return nil, false
	} else if banned {
		logger.Info("IP \"" + ip + "\" tried to log in, but they are banned.")
		http.Error(
			w,
			"Your IP address has been banned. "+
				"Please contact an administrator if you think this is a mistake.",
			http.StatusUnauthorized,
		)
		return nil, false
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
		return nil, false
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
		return nil, false
	}
	newPassword := c.PostForm("newPassword")
	version := c.PostForm("version")
	if version == "" {
		logger.Info("User from IP \"" + ip + "\" tried to log in, " +
			"but they did not provide the \"version\" parameter.")
		http.Error(
			w,
			"You must provide the \"version\" parameter to log in.",
			http.StatusUnauthorized,
		)
		return nil, false
	}

	// Trim whitespace from both sides
	username = strings.TrimSpace(username)

	// Validate that the username does not contain any whitespace
	for _, letter := range username {
		if unicode.IsSpace(letter) {
			logger.Info("User from IP \"" + ip + "\" tried to log in with a username of " +
				"\"" + username + "\", but it contained whitespace.")
			http.Error(
				w,
				"Usernames cannot contain any whitespace characters.",
				http.StatusUnauthorized,
			)
			return nil, false
		}
	}

	// Validate that the username is not excessively short
	if len(username) < MinUsernameLength {
		logger.Info("User from IP \"" + ip + "\" tried to log in with a username of " +
			"\"" + username + "\", but it is shorter than " + strconv.Itoa(MinUsernameLength) +
			" characters.")
		http.Error(
			w,
			"Usernames must be "+strconv.Itoa(MinUsernameLength)+" characters or more.",
			http.StatusUnauthorized,
		)
		return nil, false
	}

	// Validate that the username is not excessively long
	if len(username) > MaxUsernameLength {
		logger.Info("User from IP \"" + ip + "\" tried to log in with a username of " +
			"\"" + username + "\", but it is longer than " + strconv.Itoa(MaxUsernameLength) +
			" characters.")
		http.Error(
			w,
			"Usernames must be "+strconv.Itoa(MaxUsernameLength)+" characters or less.",
			http.StatusUnauthorized,
		)
		return nil, false
	}

	// Validate that the username does not have any special characters in it
	// (other than underscores, hyphens, and periods)
	if strings.ContainsAny(username, "`~!@#$%^&*()=+[{]}\\|;:'\",<>/?") {
		logger.Info("User from IP \"" + ip + "\" tried to log in with a username of " +
			"\"" + username + "\", but it has illegal special characters in it.")
		http.Error(
			w,
			"Usernames cannot contain any special characters other than underscores, hyphens, and periods.",
			http.StatusUnauthorized,
		)
		return nil, false
	}

	// Validate that the username does not have any emojis in it
	if match := emojiRegExp.FindStringSubmatch(username); match != nil {
		logger.Info("User from IP \"" + ip + "\" tried to log in with a username of " +
			"\"" + username + "\", but it has emojis in it.")
		http.Error(
			w,
			"Usernames cannot contain any emojis.",
			http.StatusUnauthorized,
		)
		return nil, false
	}

	// Validate that the username does not contain an unreasonable amount of consecutive diacritics
	// (accents)
	if numConsecutiveDiacritics(username) > ConsecutiveDiacriticsAllowed {
		logger.Info("User from IP \"" + ip + "\" tried to log in with a username of " +
			"\"" + username + "\", but it has " + strconv.Itoa(ConsecutiveDiacriticsAllowed) +
			" or more consecutive diacritics in it.")
		http.Error(
			w,
			"Usernames cannot contain two or more consecutive diacritics.",
			http.StatusUnauthorized,
		)
		return nil, false
	}

	// Validate that the username is not reserved
	normalizedUsername := normalizeString(username)
	if normalizedUsername == normalizeString(WebsiteName) ||
		normalizedUsername == "hanab" ||
		normalizedUsername == "hanabi" ||
		normalizedUsername == "live" ||
		normalizedUsername == "hlive" ||
		normalizedUsername == "hanablive" ||
		normalizedUsername == "hanabilive" ||
		normalizedUsername == "nabilive" {

		logger.Info("User from IP \"" + ip + "\" tried to log in with a username of " +
			"\"" + username + "\", but that username is reserved.")
		http.Error(
			w,
			"That username is reserved. Please choose a different one.",
			http.StatusUnauthorized,
		)
		return nil, false
	}

	// Validate that the version is correct
	// We want to explicitly disallow clients who are running old versions of the code
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
			return nil, false
		} else {
			versionNum = v
		}
		currentVersion := getVersion()
		if versionNum != currentVersion {
			logger.Info("User from IP \"" + ip + "\" tried to log in with a username of " +
				"\"" + username + "\" and a version of \"" + version + "\", " +
				"but this is an old version. " +
				"(The current version is " + strconv.Itoa(currentVersion) + ".)")
			http.Error(
				w,
				"You are running an outdated version of the client code.<br />"+
					"(You are on <strong>v"+version+"</strong> and "+
					"the latest is <strong>v"+strconv.Itoa(currentVersion)+"</strong>.)<br />"+
					"Please perform a "+
					"<a href=\"https://www.getfilecloud.com/blog/2015/03/tech-tip-how-to-do-hard-refresh-in-browsers/\">"+
					"hard-refresh</a> to get the latest version.<br />"+
					"(Note that a hard-refresh is different from a normal refresh.)<br />"+
					"On Windows, the hotkey for this is: <code>Ctrl + Shift + R</code><br />"+
					"On MacOS, the hotkey for this is: <code>Command + Shift + R</code>",
				http.StatusUnauthorized,
			)
			return nil, false
		}
	}

	data := &HTTPLoginData{
		IP:                 ip,
		Username:           username,
		Password:           password,
		NewPassword:        newPassword,
		NormalizedUsername: normalizedUsername,
	}
	return data, true
}

func httpPasswordHash(w http.ResponseWriter, password string, username string) (string, bool) {
	if v, err := argon2id.CreateHash(password, argon2id.DefaultParams); err != nil {
		logger.Error("Failed to create a hash from the submitted password for " +
			"\"" + username + "\": " + err.Error())
		http.Error(
			w,
			http.StatusText(http.StatusInternalServerError),
			http.StatusInternalServerError,
		)
		return "", false
	} else {
		return v, true
	}
}
