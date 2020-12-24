package sessions

import (
	"encoding/json"
	"fmt"
	"strings"
)

// On top of the WebSocket protocol, the client and the server communicate using a specific format
// based on the protocol that the Golem WebSocket framework uses. First, the name of the command is
// sent, then a space, then a JSON string of the data for the command, if any.
//
// Example:
//   tableJoin {"tableID":1}
//   action {"target":1,"type":2}

func packMsg(commandName string, commandData interface{}) (string, error) {
	// Convert the data to JSON
	var commandDataString string
	if commandDataJSON, err := json.Marshal(commandData); err != nil {
		return "", err
	} else {
		commandDataString = string(commandDataJSON)
	}

	return commandName + " " + commandDataString, nil
}

func unpackMsg(msg string) (string, []byte, error) {
	// This code is taken from Golem:
	// https://github.com/trevex/golem/blob/master/protocol.go
	// We use SplitN() with a value of 2 instead of Split() so that if there is a space in the JSON,
	// the data part of the splice doesn't get messed up
	result := strings.SplitN(msg, " ", 2)
	if len(result) != 2 { // nolint: gomnd
		err := fmt.Errorf("no data attached to the command")
		return "", nil, err
	}
	commandName := result[0]
	commandData := []byte(result[1])

	return commandName, commandData, nil
}
