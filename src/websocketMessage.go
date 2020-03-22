package main

import (
	"encoding/json"
	"strings"

	melody "gopkg.in/olahol/melody.v1" // A WebSocket framework
)

/*
	On top of the WebSocket protocol, the client and the server communicate using a specific format
	based on the Golem WebSocket framework protocol. First, the name of the command is sent, then a
	space, then the JSON of the data.

	Example:
		tableJoin {"gameID":1}
		action {"target":1,"type":2}
*/

func websocketMessage(ms *melody.Session, msg []byte) {
	// Lock the command mutex for the duration of the function to ensure synchronous execution
	commandMutex.Lock()
	defer commandMutex.Unlock()

	// Turn the Melody session into a custom session
	s := &Session{ms}

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
	if _, ok := commandMap[command]; !ok {
		logger.Error("User \"" + s.Username() + "\" sent an invalid command of \"" + command + "\".")
		return
	}

	// Unmarshal the JSON (this code is taken from Golem)
	var d *CommandData
	if err := json.Unmarshal(jsonData, &d); err != nil {
		logger.Error("User \"" + s.Username() + "\" sent an command of " +
			"\"" + command + "\" with invalid data: " + string(jsonData))
		return
	}

	// Validate that the user is not trying to use any internal-only fields
	if d.Username != "" ||
		d.Discord ||
		d.Server ||
		d.Spam ||
		d.OnlyDiscord ||
		d.DiscordID != "" ||
		d.DiscordDiscriminator != "" ||
		d.Args != nil {

		logger.Error("User \"" + s.Username() + "\" sent an command with " +
			"data in an internal only field.")
		return
	}

	// Call the command handler for this command
	logger.Info("Command - " + command + " - " + s.Username())
	commandMap[command](s, d)
}
