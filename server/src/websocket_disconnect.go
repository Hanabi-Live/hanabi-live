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

	delete(sessions, s.UserID)
	logger.Info("User \""+s.Username+"\" disconnected;", len(sessions), "user(s) now connected.")
}

func websocketDisconnectRemoveFromGames(s *Session) {
	// Look for the disconnecting player in all of the tables
	ongoingGameTableIDs := make([]uint64, 0)
	preGameTableIDs := make([]uint64, 0)
	spectatingTableIDs := make([]uint64, 0)

	logger.Debug("Acquiring tables read lock for user: " + s.Username)
	tablesMutex.RLock()
	logger.Debug("Acquired tables read lock for user: " + s.Username)
	for _, t := range tables {
		t.Mutex.Lock()

		// They could be one of the players (1/2)
		playerIndex := t.GetPlayerIndexFromID(s.UserID)
		if playerIndex != -1 && !t.Replay {
			if t.Running {
				ongoingGameTableIDs = append(ongoingGameTableIDs, t.ID)
			} else {
				preGameTableIDs = append(preGameTableIDs, t.ID)
			}
		}

		// They could be one of the spectators (2/2)
		spectatorIndex := t.GetSpectatorIndexFromID(s.UserID)
		if spectatorIndex != -1 {
			spectatingTableIDs = append(spectatingTableIDs, t.ID)
		}

		t.Mutex.Unlock()
	}
	tablesMutex.RUnlock()
	logger.Debug("Released tables read lock for user: " + s.Username)

	for _, ongoingGameTableID := range ongoingGameTableIDs {
		logger.Info("Unattending player \"" + s.Username + "\" from ongoing table " +
			strconv.FormatUint(ongoingGameTableID, 10) + " since they disconnected.")
		commandTableUnattend(s, &CommandData{ // Manual invocation
			TableID: ongoingGameTableID,
		})
	}

	for _, preGameTableID := range preGameTableIDs {
		logger.Info("Ejecting player \"" + s.Username + "\" from unstarted table " +
			strconv.FormatUint(preGameTableID, 10) + " since they disconnected.")
		commandTableLeave(s, &CommandData{ // Manual invocation
			TableID: preGameTableID,
		})
	}

	for _, spectatingTableID := range spectatingTableIDs {
		logger.Info("Ejecting spectator \"" + s.Username + "\" from table " +
			strconv.FormatUint(spectatingTableID, 10) + " since they disconnected.")
		commandTableUnattend(s, &CommandData{ // Manual invocation
			TableID: spectatingTableID,
		})

		// Additionally, we also want to add this user to the map of disconnected spectators
		// (so that they will be automatically reconnected to the game if/when they reconnect)
		t, exists := getTableAndLock(s, spectatingTableID, true)
		if exists {
			t.DisconSpectators[s.UserID] = struct{}{}
			t.Mutex.Unlock()
		}
	}
}
