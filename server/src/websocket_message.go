package main

import (
	"context"
	"encoding/json"
	"net"
	"strings"
	"time"

	"github.com/gabstv/melody"
)

const (
	RateLimitRate = float64(100) // Number of messages sent
	RateLimitPer  = float64(2)   // Per seconds
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
//   tableJoin {"tableID":1}
//   action {"target":1,"type":2}
func websocketMessage(ms *melody.Session, msg []byte) {
	// If the server is shutting down, ignore all incoming message from users
	if blockAllIncomingMessages.IsSet() {
		return
	}

	// Keep track of the number of ongoing executing commands
	// https://gobyexample.com/waitgroups
	commandWaitGroup.Add(1)
	defer commandWaitGroup.Done()

	// Get the respective Hanabi session for this Melody session
	s := getSessionFromMelodySession(ms)
	if s == nil {
		return
	}

	if s.Banned() {
		// We already banned this user, so ignore any of their remaining messages in the queue
		return
	}

	if !s.FakeUser {
		// Validate that the user is not attempting to flood the server
		// Algorithm from: http://stackoverflow.com/questions/667508
		now := time.Now()
		timePassed := now.Sub(s.RateLimitLastCheck()).Seconds()
		s.SetRateLimitLastCheck(now)

		newRateLimitAllowance := s.RateLimitAllowance() + timePassed*(RateLimitRate/RateLimitPer)
		if newRateLimitAllowance > RateLimitRate {
			newRateLimitAllowance = RateLimitRate
		}

		if newRateLimitAllowance < 1 {
			// They are flooding, so automatically ban them
			logger.Warn("User \"" + s.Username + "\" triggered rate-limiting; banning them.")
			ban(s)
			return
		}

		newRateLimitAllowance--
		s.SetRateLimitAllowance(newRateLimitAllowance)
	}

	ctx := NewSessionContext(s)
	sentryWebsocketMessageAttachMetadata(s)

	// Unpack the message to see what kind of command it is
	// (this code is taken from Golem)
	result := strings.SplitN(string(msg), " ", 2)
	// We use SplitN() with a value of 2 instead of Split() so that if there is a space in the JSON,
	// the data part of the splice doesn't get messed up
	if len(result) != 2 {
		logger.Error("User \"" + s.Username + "\" sent an invalid WebSocket message (with no data attached to the command).")
		return
	}
	command := result[0]
	jsonData := []byte(result[1])

	// Check to see if there is a command handler for this command
	var commandFunction func(context.Context, *Session, *CommandData)
	if v, ok := commandMap[command]; !ok {
		logger.Error("User \"" + s.Username + "\" sent an invalid command of " +
			"\"" + command + "\".")
		return
	} else {
		commandFunction = v
	}

	// Unmarshal the JSON (this code is taken from Golem)
	var d *CommandData
	if err := json.Unmarshal(jsonData, &d); err != nil {
		logger.Error("User \"" + s.Username + "\" sent a command of " +
			"\"" + command + "\" with invalid data: " + string(jsonData))
		return
	}

	// Call the command handler for this command
	logger.Info("Command - " + command + " - " + s.Username)
	commandFunction(ctx, s, d)
}

func ban(s *Session) {
	// Parse the IP address
	var ip string
	if v, _, err := net.SplitHostPort(s.ms.Request.RemoteAddr); err != nil {
		logger.Error("Failed to parse the IP address from \"" + s.ms.Request.RemoteAddr + "\": " +
			err.Error())
		return
	} else {
		ip = v
	}

	// Check to see if this IP is already banned
	if banned, err := models.BannedIPs.Check(ip); err != nil {
		logger.Error("Failed to check to see if the IP \"" + ip + "\" is banned: " + err.Error())
		return
	} else if banned {
		return
	}

	// Insert a new row in the database for this IP
	if err := models.BannedIPs.Insert(ip, s.UserID); err != nil {
		logger.Error("Failed to insert the banned IP row: " + err.Error())
		return
	}

	logoutUser(s.UserID)
	logger.Info("Successfully banned user \"" + s.Username + "\" from IP address \"" + ip + "\".")
}
