package main

import (
	"strconv"

	melody "gopkg.in/olahol/melody.v1"
)

func websocketDisconnect(ms *melody.Session) {
	s := getSessionFromMelodySession(ms)
	if s == nil {
		return
	}

	logger.Debug("Entered the \"websocketDisconnect()\" function for user: " + s.Username)

	// We only want one computer to connect to one user at a time
	// Use a dedicated mutex to prevent race conditions
	logger.Debug("Acquiring session connection write lock for user: " + s.Username)
	sessionConnectMutex.Lock()
	logger.Debug("Acquired session connection write lock for user: " + s.Username)
	defer sessionConnectMutex.Unlock()

	websocketDisconnectRemoveFromMap(s)
	websocketDisconnectRemoveFromGames(s)

	// Alert everyone that a user has logged out
	notifyAllUserLeft(s)
}

func websocketDisconnectRemoveFromMap(s *Session) {
	logger.Debug("Acquiring sessions write lock for user: " + s.Username)
	sessionsMutex.Lock()
	logger.Debug("Acquired sessions write lock for user: " + s.Username)
	defer sessionsMutex.Unlock()

	// Check to see if the existing session is different
	// (this occurs during a reconnect, for example)
	var thisSessionID uint64
	if v, exists := s.Get("sessionID"); !exists {
		logger.Error("Failed to get the \"sessionID\" key from a Melody session.")
		return false
	} else {
		thisSessionID = v.(uint64)
	}

	var otherSessionID uint64
	if v, exists := ms.Get("sessionID"); !exists {
		logger.Error("Failed to get the \"sessionID\" key from a Melody session.")
		return false
	} else {
		otherSessionID = v.(uint64)
	}

	if thisSessionID != otherSessionID {
		logger.Info("The orphaned session for user \"" + s.Username + "\" " +
			"successfully disconnected.")
		return false
	}

	delete(sessions, s.UserID)
	logger.Info("User \""+s.Username+"\" disconnected;", len(sessions), "user(s) now connected.")
	return true
}

func websocketDisconnectRemoveFromGames(s *Session) {
	// Look for the disconnecting player in all of the tables
	ongoingGameTableIDs := make([]uint64, 0)
	preGameTableIDs := make([]uint64, 0)
	spectatingTableIDs := make([]uint64, 0)

	logger.Debug("Acquiring tables read lock for user: " + username)
	tablesMutex.RLock()
	logger.Debug("Acquired tables read lock for user: " + username)
	for _, t := range tables {
		// They could be one of the players (1/2)
		playerIndex := t.GetPlayerIndexFromID(userID)
		if playerIndex != -1 && !t.Replay {
			if t.Running {
				ongoingGameTableIDs = append(ongoingGameTableIDs, t.ID)
			} else {
				preGameTableIDs = append(preGameTableIDs, t.ID)
			}
		}

		// They could be one of the spectators (2/2)
		spectatorIndex := t.GetSpectatorIndexFromID(userID)
		if spectatorIndex != -1 {
			spectatingTableIDs = append(spectatingTableIDs, t.ID)
		}
	}
	tablesMutex.RUnlock()
	logger.Debug("Released tables read lock for user: " + username)

	for _, ongoingGameTableID := range ongoingGameTableIDs {
		logger.Info("Unattending player \"" + username + "\" from ongoing table " +
			strconv.FormatUint(ongoingGameTableID, 10) + " since they disconnected.")
		commandTableUnattend(s, &CommandData{ // Manual invocation
			TableID: ongoingGameTableID,
		})
	}

	for _, preGameTableID := range preGameTableIDs {
		logger.Info("Ejecting player \"" + username + "\" from unstarted table " +
			strconv.FormatUint(preGameTableID, 10) + " since they disconnected.")
		commandTableLeave(s, &CommandData{ // Manual invocation
			TableID: preGameTableID,
		})
	}

	for _, spectatingTableID := range spectatingTableIDs {
		logger.Info("Ejecting spectator \"" + username + "\" from table " +
			strconv.FormatUint(spectatingTableID, 10) + " since they disconnected.")
		commandTableUnattend(s, &CommandData{ // Manual invocation
			TableID: spectatingTableID,
		})

		// Additionally, we also want to add this user to the map of disconnected spectators
		// (so that they will be automatically reconnected to the game if/when they reconnect)
		t, exists := getTableAndLock(s, spectatingTableID, true)
		if exists {
			t.DisconSpectators[userID] = struct{}{}
			t.Mutex.Unlock()
		}
	}
}
