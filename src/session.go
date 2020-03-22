package main

import (
	"encoding/json"

	melody "gopkg.in/olahol/melody.v1"
)

type Session struct {
	*melody.Session
}

/*
	Functions to return session values
*/

func (s *Session) SessionID() int {
	if s == nil {
		logger.Error("The \"SessionID\" method was called for a nil session.")
		return -1
	}

	if v, exists := s.Get("sessionID"); !exists {
		logger.Error("Failed to get \"SessionID\" from a session.")
		return -1
	} else {
		return v.(int)
	}
}

func (s *Session) UserID() int {
	if s == nil {
		logger.Error("The \"UserID\" method was called for a nil session.")
		return -1
	}

	if v, exists := s.Get("userID"); !exists {
		logger.Error("Failed to get \"userID\" from a session.")
		return -1
	} else {
		return v.(int)
	}
}

func (s *Session) Username() string {
	if s == nil {
		logger.Error("The \"Username\" method was called for a nil session.")
		return "Unknown"
	}

	if v, exists := s.Get("username"); !exists {
		logger.Error("Failed to get \"username\" from a session.")
		return "Unknown"
	} else {
		return v.(string)
	}
}

func (s *Session) Admin() bool {
	if s == nil {
		logger.Error("The \"Admin\" method was called for a nil session.")
		return false
	}

	if v, exists := s.Get("admin"); !exists {
		logger.Error("Failed to get \"admin\" from a session.")
		return false
	} else {
		return v.(bool)
	}
}

func (s *Session) FirstTimeUser() bool {
	if s == nil {
		logger.Error("The \"FirstTimeUser\" method was called for a nil session.")
		return false
	}

	if v, exists := s.Get("firstTimeUser"); !exists {
		logger.Error("Failed to get \"firstTimeUser\" from a session.")
		return false
	} else {
		return v.(bool)
	}
}

func (s *Session) CurrentTable() int {
	if s == nil {
		logger.Error("The \"CurrentTable\" method was called for a nil session.")
		return -1
	}

	if v, exists := s.Get("currentTable"); !exists {
		logger.Error("Failed to get \"currentTable\" from a session.")
		return -1
	} else {
		return v.(int)
	}
}

func (s *Session) Status() int {
	if s == nil {
		logger.Error("The \"Status\" method was called for a nil session.")
		return -1
	}

	if v, exists := s.Get("status"); !exists {
		logger.Error("Failed to get \"status\" from a session.")
		return -1
	} else {
		return v.(int)
	}
}

/*
	General purpose functions
*/

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
		message = "Something went wrong. Please contact an administrator."
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
		message = "Something went wrong. Please contact an administrator."
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
			if p.Name == s.Username() {
				return t
			}
		}
	}

	return nil
}
