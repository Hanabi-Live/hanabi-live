// General purpose session functions

package main

import (
	"encoding/json"

	melody "gopkg.in/olahol/melody.v1"
)

type Session struct {
	*melody.Session
}

// Emit sends a message to a client using the Golem-style protocol described above
func (s *Session) Emit(command string, d interface{}) {
	if s == nil || s.Session == nil || s.Session.Request == nil {
		return
	}

	// Convert the data to JSON
	var ds string
	if dj, err := json.Marshal(d); err != nil {
		logger.Error("Failed to marshal data when writing to a WebSocket session:", err)
		return
	} else {
		ds = string(dj)
	}

	// Send the message as bytes
	msg := command + " " + ds
	bytes := []byte(msg)
	if err := s.Write(bytes); err != nil {
		// This can routinely fail if the session is closed, so just return
		return
	}
}

func (s *Session) Warning(message string) {
	// Specify a default warning message
	if message == "" {
		message = DefaultErrorMsg
	}

	logger.Info("Warning - " + message + " - " + s.Username())

	type WarningMessage struct {
		Warning string `json:"warning"`
	}
	s.Emit("warning", &WarningMessage{
		message,
	})
}

// Sent to the client if either their command was unsuccessful or something else went wrong
func (s *Session) Error(message string) {
	// Specify a default error message
	if message == "" {
		message = DefaultErrorMsg
	}

	logger.Info("Error - " + message + " - " + s.Username())

	type ErrorMessage struct {
		Error string `json:"error"`
	}
	s.Emit("error", &ErrorMessage{
		message,
	})
}

func (s *Session) GetJoinedTable() *Table {
	for _, t := range tables {
		if t.Replay {
			continue
		}

		for _, p := range t.Players {
			if p.ID == s.UserID() {
				return t
			}
		}
	}

	return nil
}
