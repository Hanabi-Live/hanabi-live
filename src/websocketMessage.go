package main

import (
	"encoding/json"
	"net"
	"strconv"
	"strings"
	"time"

	sentry "github.com/getsentry/sentry-go"
	melody "gopkg.in/olahol/melody.v1"
)

const (
	rateLimitRate = float64(50) // Number of messages sent
	rateLimitPer  = float64(2)  // Per seconds
)

// websocketMessage is fired every time a WebSocket user sends a message to the server
// It deciphers the command and then funnels the request to the appropriate command handler
//
// On top of the WebSocket protocol, the client and the server communicate using a specific format
// based on the protocol that the Golem WebSocket framework uses
// First, the name of the command is sent, then a space,
// then a JSON string of the data for the command, if any
//
// Example:
//   tableJoin {"gameID":1}
//   action {"target":1,"type":2}
func websocketMessage(ms *melody.Session, msg []byte) {
	// Lock the command mutex for the duration of the function to ensure synchronous execution
	commandMutex.Lock()
	defer commandMutex.Unlock()

	// Turn the Melody session into a custom session
	s := &Session{ms}

	if s.Banned() {
		// We already banned this user, so ignore any of their remaining messages in the queue
		return
	}

	if !s.FakeUser() {
		// Validate that the user is not attempting to flood the server
		// Algorithm from: http://stackoverflow.com/questions/667508
		now := time.Now()
		timePassed := now.Sub(s.RateLimitLastCheck()).Seconds()
		s.Set("rateLimitLastCheck", now)

		newRateLimitAllowance := s.RateLimitAllowance() + timePassed*(rateLimitRate/rateLimitPer)
		if newRateLimitAllowance > rateLimitRate {
			newRateLimitAllowance = rateLimitRate
		}

		if newRateLimitAllowance < 1 {
			// They are flooding, so automatically ban them
			logger.Warning("User \"" + s.Username() + "\" triggered rate-limiting; banning them.")
			ban(s)
			return
		}

		newRateLimitAllowance--
		s.Set("rateLimitAllowance", newRateLimitAllowance)
	}

	if usingSentry {
		// Parse the IP address
		var ip string
		if v, _, err := net.SplitHostPort(s.Session.Request.RemoteAddr); err != nil {
			logger.Error("Failed to parse the IP address in the WebSocket function:", err)
			return
		} else {
			ip = v
		}

		// If we encounter an error later on, we want metadata to be attached to the error message,
		// which can be helpful for debugging (since we can ask the user how they caused the error)
		// We use "SetTags()" instead of "SetUser()" since tags are more easy to see in the
		// Sentry GUI than users
		sentry.ConfigureScope(func(scope *sentry.Scope) {
			scope.SetTag("userID", strconv.Itoa(s.UserID()))
			scope.SetTag("username", s.Username())
			scope.SetTag("ip", ip)
		})
	}

	// Unpack the message to see what kind of command it is
	// (this code is taken from Golem)
	result := strings.SplitN(string(msg), " ", 2)
	// We use SplitN() with a value of 2 instead of Split() so that if there is a space in the JSON,
	// the data part of the splice doesn't get messed up
	if len(result) != 2 {
		logger.Error("User \"" + s.Username() + "\" sent an invalid WebSocket message.")
		return
	}
	command := result[0]
	jsonData := []byte(result[1])

	// Check to see if there is a command handler for this command
	var commandMapFunction func(*Session, *CommandData)
	if v, ok := commandMap[command]; ok {
		commandMapFunction = v
	} else {
		logger.Error("User \"" + s.Username() + "\" sent an invalid command of " +
			"\"" + command + "\".")
		return
	}

	// Unmarshal the JSON (this code is taken from Golem)
	var d *CommandData
	if err := json.Unmarshal(jsonData, &d); err != nil {
		logger.Error("User \"" + s.Username() + "\" sent an command of " +
			"\"" + command + "\" with invalid data: " + string(jsonData))
		return
	}

	// Call the command handler for this command
	logger.Info("Command - " + command + " - " + s.Username())
	commandMapFunction(s, d)
}

func ban(s *Session) {
	// Parse the IP address
	var ip string
	if v, _, err := net.SplitHostPort(s.Session.Request.RemoteAddr); err != nil {
		logger.Error("Failed to parse the IP address in the WebSocket function:", err)
		return
	} else {
		ip = v
	}

	// Check to see if this IP is already banned
	if banned, err := models.BannedIPs.Check(ip); err != nil {
		logger.Error("Failed to check to see if the IP \""+ip+"\" is banned:", err)
		return
	} else if banned {
		return
	}

	// Insert a new row in the database for this IP
	if err := models.BannedIPs.Insert(ip, s.UserID()); err != nil {
		logger.Error("Failed to insert the banned IP row:", err)
		return
	}

	logoutUser(s.Username())
	logger.Info("Successfully banned user \"" + s.Username() + "\" from IP address \"" + ip + "\".")
}
