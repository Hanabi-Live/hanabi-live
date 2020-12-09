package httpmain

import (
	"crypto/sha256"
	"fmt"
	"net"
	"net/http"
	"strconv"
	"strings"
	"unicode"

	"github.com/Zamiell/hanabi-live/server/pkg/models"
	"github.com/Zamiell/hanabi-live/server/pkg/util"
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
	NormalizedUsername string
}

// login handles part 1 of 2 for login authentication
// The user must POST to "/login" with the values of "username", "password", and "version"
// If successful, they will receive a cookie from the server
// Part 2 is found in "ws.go"
//
// By allowing this function to run concurrently between goroutines with no locking,
// there is a race condition where a new user can login twice at the same time and
// "models.Users.Insert()" will be called twice
// However, the UNIQUE SQL constraint on the "username" row and the "normalized_username" row will
// prevent the 2nd insersion from completing, and the second goroutine will return at that point
func login(c *gin.Context) {
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
		hLog.Errorf("Failed to get user \"%v\": %v", data.Username, err)
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
			// This is the first time that they are logging in after the password hash transition
			// that occurred in April 2020
			// Hash the submitted password with SHA256
			passwordSalt := "Hanabi password "
			combined := passwordSalt + data.Password
			oldPasswordHashBytes := sha256.Sum256([]byte(combined))
			oldPasswordHashString := fmt.Sprintf("%x", oldPasswordHashBytes)
			if oldPasswordHashString != user.OldPasswordHash.String {
				http.Error(w, "That is not the correct password.", http.StatusUnauthorized)
				return
			}

			// Create an Argon2id hash of the plain-text password
			var passwordHash string
			if v, err := argon2id.CreateHash(data.Password, argon2id.DefaultParams); err != nil {
				hLog.Errorf(
					"Failed to create a hash from the submitted password for %v: %v",
					util.PrintUser(user.ID, user.Username),
					err,
				)
				http.Error(
					w,
					http.StatusText(http.StatusInternalServerError),
					http.StatusInternalServerError,
				)
				return
			} else {
				passwordHash = v
			}

			// Update their password to the new Argon2 format
			if err := models.Users.UpdatePassword(user.ID, passwordHash); err != nil {
				hLog.Errorf(
					"Failed to set the new hash for %v: %v",
					util.PrintUser(user.ID, user.Username),
					err,
				)
				http.Error(
					w,
					http.StatusText(http.StatusInternalServerError),
					http.StatusInternalServerError,
				)
				return
			}
		} else {
			// Check to see if their password is correct
			if !user.PasswordHash.Valid {
				hLog.Errorf(
					"Failed to get the Argon2 hash from the database for %v.",
					util.PrintUser(user.ID, user.Username),
				)
				http.Error(
					w,
					http.StatusText(http.StatusInternalServerError),
					http.StatusInternalServerError,
				)
				return
			}
			if match, err := argon2id.ComparePasswordAndHash(
				data.Password,
				user.PasswordHash.String,
			); err != nil {
				hLog.Errorf(
					"Failed to compare the password to the Argon2 hash for %v: %v",
					util.PrintUser(user.ID, user.Username),
					err,
				)
				http.Error(
					w,
					http.StatusText(http.StatusInternalServerError),
					http.StatusInternalServerError,
				)
				return
			} else if !match {
				http.Error(w, "That is not the correct password.", http.StatusUnauthorized)
				return
			}
		}
	} else {
		// Check to see if any other users have a normalized version of this username
		// This prevents username-spoofing attacks and homoglyph usage
		// e.g. "alice" trying to impersonate "Alice"
		// e.g. "Alicé" trying to impersonate "Alice"
		// e.g. "Αlice" with a Greek letter A (0x391) trying to impersonate "Alice"
		if data.NormalizedUsername == "" {
			http.Error(
				w,
				"That username cannot be transliterated to ASCII. Please try using a simpler username or try using less special characters.",
				http.StatusUnauthorized,
			)
			return
		}
		if normalizedExists, similarUsername, err := models.Users.NormalizedUsernameExists(
			data.NormalizedUsername,
		); err != nil {
			hLog.Errorf(
				"Failed to check for normalized password uniqueness for \"%v\": %v",
				data.Username,
				err,
			)
			http.Error(
				w,
				http.StatusText(http.StatusInternalServerError),
				http.StatusInternalServerError,
			)
			return
		} else if normalizedExists {
			http.Error(
				w,
				fmt.Sprintf(
					"That username is too similar to the existing user of "+"\"%v\". If you are sure that this is your username, then please check to make sure that you are capitalized your username correctly. If you are logging on for the first time, then please choose a different username.",
					similarUsername,
				),
				http.StatusUnauthorized,
			)
			return
		}

		// Create an Argon2id hash of the plain-text password
		var passwordHash string
		if v, err := argon2id.CreateHash(data.Password, argon2id.DefaultParams); err != nil {
			hLog.Errorf(
				"Failed to create a hash from the submitted password for \"%v\": %v",
				data.Username,
				err,
			)
			http.Error(
				w,
				http.StatusText(http.StatusInternalServerError),
				http.StatusInternalServerError,
			)
			return
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
			hLog.Errorf("Failed to insert user \"%v\": %v", data.Username, err)
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
	if err := session.Save(); err != nil {
		hLog.Errorf(
			"Failed to write to the login cookie for %v: %v",
			util.PrintUser(user.ID, user.Username),
			err,
		)
		http.Error(
			w,
			http.StatusText(http.StatusInternalServerError),
			http.StatusInternalServerError,
		)
		return
	}

	// Log the login request and give a "200 OK" HTTP code
	// (returning a code is not actually necessary but Firefox will complain otherwise)
	hLog.Infof(
		"%v logged in from: %v",
		util.PrintUserCapitalized(user.ID, user.Username),
		data.IP,
	)
	http.Error(w, http.StatusText(http.StatusOK), http.StatusOK)

	// Next, the client will attempt to establish a WebSocket connection,
	// which is handled in "httpWS.go"
}

func httpLoginValidate(c *gin.Context) (*HTTPLoginData, bool) {
	// Local variables
	r := c.Request
	w := c.Writer

	// Parse the IP address
	var ip string
	if v, _, err := net.SplitHostPort(r.RemoteAddr); err != nil {
		hLog.Errorf("Failed to parse the IP address from \"%v\": %v", r.RemoteAddr, err)
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
		hLog.Errorf("Failed to check to see if the IP \"%v\" is banned: %v", ip, err)
		http.Error(
			w,
			http.StatusText(http.StatusInternalServerError),
			http.StatusInternalServerError,
		)
		return nil, false
	} else if banned {
		hLog.Infof("IP \"%v\" tried to log in, but they are banned.", ip)
		http.Error(
			w,
			"Your IP address has been banned. Please contact an administrator if you think this is a mistake.",
			http.StatusUnauthorized,
		)
		return nil, false
	}

	// Validate that the user sent the required POST values
	username := c.PostForm("username")
	if username == "" {
		hLog.Infof(
			"User from IP \"%v\" tried to log in, but they did not provide the \"username\" parameter.",
			ip,
		)
		http.Error(
			w,
			"You must provide the \"username\" parameter to log in.",
			http.StatusUnauthorized,
		)
		return nil, false
	}
	password := c.PostForm("password")
	if password == "" {
		hLog.Infof(
			"User from IP \"%v\" tried to log in, but they did not provide the \"password\" parameter.",
			ip,
		)
		http.Error(
			w,
			"You must provide the \"password\" parameter to log in.",
			http.StatusUnauthorized,
		)
		return nil, false
	}
	version := c.PostForm("version")
	if version == "" {
		hLog.Infof(
			"User from IP \"%v\" tried to log in, but they did not provide the \"version\" parameter.",
			ip,
		)
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
			hLog.Infof(
				"User from IP \"%v\" tried to log in with a username of \"%v\", but it contained whitespace.",
				ip,
				username,
			)
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
		hLog.Infof(
			"User from IP \"%v\" tried to log in with a username of \"%v\", but it is shorter than %v characters.",
			ip,
			username,
			MinUsernameLength,
		)
		http.Error(
			w,
			fmt.Sprintf("Usernames must be %v characters or more.", MinUsernameLength),
			http.StatusUnauthorized,
		)
		return nil, false
	}

	// Validate that the username is not excessively long
	if len(username) > MaxUsernameLength {
		hLog.Infof(
			"User from IP \"%v\" tried to log in with a username of \"%v\", but it is longer than %v characters.",
			ip,
			username,
			MaxUsernameLength,
		)
		http.Error(
			w,
			fmt.Sprintf("Usernames must be %v characters or less.", MaxUsernameLength),
			http.StatusUnauthorized,
		)
		return nil, false
	}

	// Validate that the username does not have any special characters in it
	// (other than underscores, hyphens, and periods)
	if strings.ContainsAny(username, "`~!@#$%^&*()=+[{]}\\|;:'\",<>/?") {
		hLog.Infof(
			"User from IP \"%v\" tried to log in with a username of \"%v\", but it has illegal special characters in it.",
			ip,
			username,
		)
		http.Error(
			w,
			"Usernames cannot contain any special characters other than underscores, hyphens, and periods.",
			http.StatusUnauthorized,
		)
		return nil, false
	}

	// Validate that the username does not have any emojis in it
	if match := emojiRegExp.FindStringSubmatch(username); match != nil {
		hLog.Infof(
			"User from IP \"%v\" tried to log in with a username of \"%v\", but it has emojis in it.",
			ip,
			username,
		)
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
		hLog.Infof(
			"User from IP \"%v\" tried to log in with a username of \"%v\", but it has %v or more consecutive diacritics in it.",
			ip,
			username,
			ConsecutiveDiacriticsAllowed,
		)
		http.Error(
			w,
			fmt.Sprintf(
				"Usernames cannot contain %v or more consecutive diacritics.",
				ConsecutiveDiacriticsAllowed,
			),
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

		hLog.Infof(
			"User from IP \"%v\" tried to log in with a username of \"%v\", but that username is reserved.",
			ip,
			username,
		)
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
			hLog.Infof(
				"User from IP \"%v\" tried to log in with a username of \"%v\", but the submitted version is not an integer.",
				ip,
				username,
			)
			http.Error(
				w,
				fmt.Sprintf("The version of \"%v\" must be an integer.", version),
				http.StatusUnauthorized,
			)
			return nil, false
		} else {
			versionNum = v
		}
		currentVersion := getVersion()
		if versionNum != currentVersion {
			hLog.Infof(
				"User from IP \"%v\" tried to log in with a username of \"%v\" and a version of \"%v\", but this is an old version. (The current version is \"%v\".)",
				ip,
				username,
				version,
				currentVersion,
			)
			msg := fmt.Sprintf(
				"You are running an outdated version of the client code.<br />"+
					"(You are on <strong>v%v</strong> and the latest is <strong>v%v</strong>.)<br />"+
					"Please perform a <a href=\"https://www.getfilecloud.com/blog/2015/03/tech-tip-how-to-do-hard-refresh-in-browsers/\">hard-refresh</a> to get the latest version.<br />"+
					"(Note that a hard-refresh is different from a normal refresh.)<br />"+
					"On Windows, the hotkey for this is: <code>Ctrl + Shift + R</code><br />"+
					"On MacOS, the hotkey for this is: <code>Command + Shift + R</code>",
				version,
				currentVersion,
			)
			http.Error(
				w,
				msg,
				http.StatusUnauthorized,
			)
			return nil, false
		}
	}

	data := &HTTPLoginData{
		IP:                 ip,
		Username:           username,
		Password:           password,
		NormalizedUsername: normalizedUsername,
	}
	return data, true
}
