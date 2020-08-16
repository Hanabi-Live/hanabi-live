package main

import (
	"strconv"

	melody "gopkg.in/olahol/melody.v1"
)

func websocketDisconnect(ms *melody.Session) {
	// Turn the Melody session into a custom session
	s := &Session{ms}

	// We only want one computer to connect to one user at a time
	// Use a mutex to prevent race conditions
	sessionsMutex.Lock()
	defer sessionsMutex.Unlock()

	// We have to do the work in a separate function so that
	// we can call it manually in the "websocketConnect()" function
	websocketDisconnect2(s)
}

// websocketDisconnect2 does the main work of disconnecting a WebSocket connection
// It is assumed that the "sessionMutex" is locked before getting here
func websocketDisconnect2(s *Session) {
	// Check to see if the existing session is different
	// (this occurs during a reconnect, for example)
	if s2, ok := sessions[s.UserID()]; !ok {
		logger.Info("User \"" + s.Username() + "\" disconnected, " +
			"but their session was already deleted.")
		return
	} else if s2.SessionID() != s.SessionID() {
		logger.Info("The orphaned session for user \"" + s.Username() + "\" " +
			"successfully disconnected.")
		return
	}

	// Delete the connection from the session map
	// (we do this first so that we don't bother sending them any more notifications)
	delete(sessions, s.UserID())

	// Look for the disconnecting player in all of the tables
	ongoingGameTableIDs := make([]uint64, 0)
	preGameTableIDs := make([]uint64, 0)
	spectatingTableIDs := make([]uint64, 0)

	tablesMutex.RLock()
	for _, t := range tables {
		// They could be one of the players (1/2)
		if !t.Replay && t.GetPlayerIndexFromID(s.UserID()) != -1 {
			if t.Running {
				ongoingGameTableIDs = append(ongoingGameTableIDs, t.ID)
			} else {
				preGameTableIDs = append(preGameTableIDs, t.ID)
			}
		}

		// They could be one of the spectators (2/2)
		if t.GetSpectatorIndexFromID(s.UserID()) != -1 {
			spectatingTableIDs = append(spectatingTableIDs, t.ID)
		}
	}
	tablesMutex.RUnlock()

	for _, ongoingGameTableID := range ongoingGameTableIDs {
		logger.Info("Unattending player \"" + s.Username() + "\" from ongoing table " +
			strconv.FormatUint(ongoingGameTableID, 10) + " since they disconnected.")
		commandTableUnattend(s, &CommandData{ // Manual invocation
			TableID: ongoingGameTableID,
		})
	}

	for _, preGameTableID := range preGameTableIDs {
		logger.Info("Ejecting player \"" + s.Username() + "\" from unstarted table " +
			strconv.FormatUint(preGameTableID, 10) + " since they disconnected.")
		commandTableLeave(s, &CommandData{ // Manual invocation
			TableID: preGameTableID,
		})
	}

	for _, spectatingTableID := range spectatingTableIDs {
		t, exists := getTableAndLock(s, spectatingTableID, true)
		if !exists {
			continue
		}

		logger.Info("Ejecting spectator \"" + s.Username() + "\" from table " +
			strconv.FormatUint(spectatingTableID, 10) + " since they disconnected.")

		// Add them to the disconnected spectators map
		// (so that they will be automatically reconnected to the game if/when they reconnect)
		t.DisconSpectators[s.UserID()] = struct{}{}

		commandTableUnattend(s, &CommandData{ // Manual invocation
			TableID: t.ID,
			NoLock:  true,
		})
		t.Mutex.Unlock()
	}

	// Alert everyone that a user has logged out
	notifyAllUserLeft(s)

	// Log the disconnection
	logger.Info("User \""+s.Username()+"\" disconnected;", len(sessions), "user(s) now connected.")
}
