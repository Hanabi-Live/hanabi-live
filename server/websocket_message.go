package main

import (
	"github.com/gabstv/melody"
)

const (
	RateLimitRate = float64(100) // Number of messages sent
	RateLimitPer  = float64(2)   // Per seconds
)

// websocketMessage is fired every time a WebSocket user sends a message to the server
func websocketMessage(ms *melody.Session, msg []byte) {
	/*
		sentryWebsocketMessageAttachMetadata(s) // ADD SENTRY TO OTHER THING


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

		// Call the command handler for this command
		hLog.Infof("Command - %v - %v", command, s.Username)
		commandFunction(ctx, s, d)
	*/
}
