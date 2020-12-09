package main

import (
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

	/*
		ctx := NewSessionContext(s)
		sentryWebsocketMessageAttachMetadata(s) // ADD SENTRY TO OTHER THING

		// Unpack the message to see what kind of command it is
		// (this code is taken from Golem)
		result := strings.SplitN(string(msg), " ", 2)
		// We use SplitN() with a value of 2 instead of Split() so that if there is a space in the JSON,
		// the data part of the splice doesn't get messed up
		if len(result) != 2 {
			hLog.Warnf(
				"%v sent an invalid WebSocket message (with no data attached to the command).",
				util.PrintUserCapitalized(s.UserID, s.Username),
			)
			return
		}
		command := result[0]
		jsonData := []byte(result[1])

		// Check to see if there is a command handler for this command
		var commandFunction func(context.Context, *Session, *CommandData)
		if v, ok := commandMap[command]; !ok {
			hLog.Warnf(
				"%v sent an invalid command of: %v",
				util.PrintUserCapitalized(s.UserID, s.Username),
				command,
			)
			return
		} else {
			commandFunction = v
		}

		// Unmarshal the JSON (this code is taken from Golem)
		var d *CommandData
		if err := json.Unmarshal(jsonData, &d); err != nil {
			hLog.Warnf(
				"%v sent a command of \"%v\" with invalid data: %v",
				util.PrintUserCapitalized(s.UserID, s.Username),
				command,
				string(jsonData),
			)
			return
		}

		// Call the command handler for this command
		hLog.Infof("Command - %v - %v", command, s.Username)
		commandFunction(ctx, s, d)
	*/
}
