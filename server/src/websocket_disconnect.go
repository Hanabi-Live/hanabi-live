package main

import (
	"strconv"

	melody "gopkg.in/olahol/melody.v1"
)

func websocketDisconnect(ms *melody.Session) {
	// Turn the Melody session into a custom session
	s := &Session{ms}

	// We only want one computer to connect to one user at a time
	// Use a dedicated mutex to prevent race conditions
	logger.Debug("Acquiring session connection write lock for user: " + s.Username())
	sessionConnectMutex.Lock()
	logger.Debug("Acquired session connection write lock for user: " + s.Username())
	defer sessionConnectMutex.Unlock()

	websocketDisconnectRemoveFromMap(s)
	websocketDisconnectRemoveFromGames(s)
}

func websocketDisconnectRemoveFromMap(s *Session) {
	logger.Debug("Acquiring sessions write lock for user: " + s.Username())
	sessionsMutex.Lock()
	logger.Debug("Acquired sessions write lock for user: " + s.Username())
	defer sessionsMutex.Unlock()

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

	delete(sessions, s.UserID())
}

func websocketDisconnectRemoveFromGames(s *Session) {
	// Look for the disconnecting player in all of the tables
	ongoingGameTableIDs := make([]uint64, 0)
	preGameTableIDs := make([]uint64, 0)
	spectatingTableIDs := make([]uint64, 0)

	logger.Debug("Acquiring tables read lock for user: " + s.Username())
	tablesMutex.RLock()
	logger.Debug("Acquired tables read lock for user: " + s.Username())
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
