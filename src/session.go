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

func (s *Session) ID() int {
	if s == nil {
		log.Error("The \"ID\" method was called for a nil session.")
		return -1
	}

	if v, exists := s.Get("ID"); !exists {
		log.Error("Failed to get \"ID\" from a session.")
		return -1
	} else {
		return v.(int)
	}
}

func (s *Session) UserID() int {
	if s == nil {
		log.Error("The \"UserID\" method was called for a nil session.")
		return -1
	}

	if v, exists := s.Get("userID"); !exists {
		log.Error("Failed to get \"userID\" from a session.")
		return -1
	} else {
		return v.(int)
	}
}

func (s *Session) Username() string {
	if s == nil {
		log.Error("The \"Username\" method was called for a nil session.")
		return "Unknown"
	}

	if v, exists := s.Get("username"); !exists {
		log.Error("Failed to get \"username\" from a session.")
		return "Unknown"
	} else {
		return v.(string)
	}
}

func (s *Session) Admin() bool {
	if s == nil {
		log.Error("The \"Admin\" method was called for a nil session.")
		return false
	}

	if v, exists := s.Get("admin"); !exists {
		log.Error("Failed to get \"admin\" from a session.")
		return false
	} else {
		return v.(bool)
	}
}

func (s *Session) FirstTimeUser() bool {
	if s == nil {
		log.Error("The \"FirstTimeUser\" method was called for a nil session.")
		return false
	}

	if v, exists := s.Get("firstTimeUser"); !exists {
		log.Error("Failed to get \"firstTimeUser\" from a session.")
		return false
	} else {
		return v.(bool)
	}
}

func (s *Session) CurrentGame() int {
	if s == nil {
		log.Error("The \"CurrentGame\" method was called for a nil session.")
		return -1
	}

	if v, exists := s.Get("currentGame"); !exists {
		log.Error("Failed to get \"currentGame\" from a session.")
		return -1
	} else {
		return v.(int)
	}
}

func (s *Session) Status() int {
	if s == nil {
		log.Error("The \"Status\" method was called for a nil session.")
		return -1
	}

	if v, exists := s.Get("status"); !exists {
		log.Error("Failed to get \"status\" from a session.")
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
		log.Error("Failed to marshal data when writing to a WebSocket session:", err)
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

	log.Info("Warning - " + message + " - " + s.Username())

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

	log.Info("Error - " + message + " - " + s.Username())

	type ErrorMessage struct {
		Error string `json:"error"`
	}
	s.Emit("error", &ErrorMessage{
		message,
	})
}

func (s *Session) GetJoinedGame() *Game {
	for _, g := range games {
		if g.Replay {
			continue
		}

		for _, p := range g.Players {
			if p.Name == s.Username() {
				return g
			}
		}
	}

	return nil
}
