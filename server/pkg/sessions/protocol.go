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

func packMsg(command string, data interface{}) (string, error) {
	// Convert the data to JSON
	var dataString string
	if dataJSON, err := json.Marshal(data); err != nil {
		return "", err
	} else {
		dataString = string(dataJSON)
	}

	return command + " " + dataString, nil
}

func unpackMsg(msg string) (string, interface{}, error) {
	// This code is taken from Golem:
	// https://github.com/trevex/golem/blob/master/protocol.go
	// We use SplitN() with a value of 2 instead of Split() so that if there is a space in the JSON,
	// the data part of the splice doesn't get messed up
	result := strings.SplitN(msg, " ", 2)
	if len(result) != 2 { // nolint: gomnd
		err := fmt.Errorf("no data attached to the command")
		return "", nil, err
	}
	command := result[0]
	jsonData := []byte(result[1])

	// Unmarshal the JSON
	var data interface{}
	if err := json.Unmarshal(jsonData, &data); err != nil {
		err2 := fmt.Errorf("the command of \"%v\" has invalid data: %w", command, err)
		return "", nil, err2
	}

	return command, data, nil
}
