package main

import (
	"sync"

	"github.com/gabstv/melody"
)

var (
	// This is the Melody WebSocket router
	// We choose Melody as a framework because it is a bit higher level than the two most popular
	// candidates, "gorilla/websocket" and "nhooyr/websocket"
	// We use a fork of Melody ("gabstv/melody") because the original ("olahol/melody") is
	// unmaintained and the fork fixes some race conditions
	melodyRouter *melody.Melody

	// We keep track of all WebSocket sessions
	sessions = NewSessions()

	// We keep track of all ongoing WebSocket messages/commands
	commandWaitGroup sync.WaitGroup
)

func websocketInit() {
	// Fill the command handler map
	// (which is used in the "websocketHandleMessage" function)
	commandInit()

	// Define a new Melody router
	melodyRouter = melody.New()

	// The default maximum message size is 512 bytes,
	// but this is not long enough to send game objects
	// Thus, we have to manually increase it
	melodyRouter.Config.MaxMessageSize = 8192

	// Attach some handlers
	melodyRouter.HandleConnect(websocketConnect)
	melodyRouter.HandleDisconnect(websocketDisconnect)
	melodyRouter.HandleMessage(websocketMessage)
	// We could also attach a function to HandleError, but this fires on routine
	// things like disconnects, so it is undesirable
}

func websocketGetKeyValues(ms *melody.Session) (uint64, int, string, bool) {
	// Get the session ID from from the attached key
	var sessionID uint64
	if v, exists := ms.Get("sessionID"); !exists {
		logger.Error("Failed to get the \"sessionID\" key from a Melody session.")
		return 0, 0, "", false
	} else {
		sessionID = v.(uint64)
	}

	// Get the user ID from from the attached key
	var userID int
	if v, exists := ms.Get("userID"); !exists {
		logger.Error("Failed to get the \"userID\" key from a Melody session.")
		return 0, 0, "", false
	} else {
		userID = v.(int)
	}

	// Get the username from the attached key
	var username string
	if v, exists := ms.Get("username"); !exists {
		logger.Error("Failed to get the \"username\" key from a Melody session.")
		return 0, 0, "", false
	} else {
		username = v.(string)
	}

	return sessionID, userID, username, true
}

// getSessionFromMelodySession returns nil if the respective Melody session has already been removed
// from the sessions map
func getSessionFromMelodySession(ms *melody.Session) *Session {
	sessionID, userID, _, success := websocketGetKeyValues(ms)
	if !success {
		return nil
	}

	// Check to see if a session matching this user ID is in the sessions map
	s, ok := sessions.Get(userID)
	if !ok {
		return nil
	}

	// Check to see if the session ID matches
	// (e.g. it could be the same user but a different computer)
	if sessionID != s.SessionID {
		return nil
	}

	return s
}
