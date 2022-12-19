package main

import (
	"context"
	"strconv"

	"github.com/Hanabi-Live/hanabi-live/logger"
	"github.com/gabstv/melody"
)

func websocketDisconnect(ms *melody.Session) {
	s := getSessionFromMelodySession(ms)
	if s == nil {
		return
	}

	logger.Info("Entered the \"websocketDisconnect()\" function for user: " + s.Username)

	ctx := NewSessionContext(s)

	// We only want one computer to connect to one user at a time
	// Use a dedicated mutex to prevent race conditions
	sessions.ConnectMutex.Lock()
	defer sessions.ConnectMutex.Unlock()

	websocketDisconnectRemoveFromMap(s)
	websocketDisconnectRemoveFromGames(ctx, s)

	// Alert everyone that a user has logged out
	notifyAllUserLeft(s)

	logger.Info("Exited the \"websocketDisconnect()\" function for user: " + s.Username)
}

func websocketDisconnectRemoveFromMap(s *Session) {
	sessions.Delete(s.UserID)
	logger.Info("User \"" + s.Username + "\" disconnected; " +
		strconv.Itoa(sessions.Length()) + " user(s) now connected.")
}

type spectatorData struct {
	tableId  uint64
	shadowId int
}

func websocketDisconnectRemoveFromGames(ctx context.Context, s *Session) {
	// Look for the disconnecting player in all of the tables
	ongoingGameTableIDs := make([]uint64, 0)
	preGameTableIDs := make([]uint64, 0)
	spectatingTableIDs := make([]spectatorData, 0)

	tableList := tables.GetList(true)
	for _, t := range tableList {
		t.Lock(ctx)

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
		if t.IsActivelySpectating(s.UserID) {
			spectatorIndex := t.GetSpectatorIndexFromID(s.UserID)
			shadowingIndex := -1
			if spectatorIndex != -1 {
				sp := t.Spectators[spectatorIndex]
				shadowingIndex = sp.ShadowingPlayerIndex
			}
			spectatingTableIDs = append(spectatingTableIDs, spectatorData{tableId: t.ID, shadowId: shadowingIndex})
		}

		t.Unlock(ctx)
	}

	for _, ongoingGameTableID := range ongoingGameTableIDs {
		logger.Info("Unattending player \"" + s.Username + "\" from ongoing table " +
			strconv.FormatUint(ongoingGameTableID, 10) + " since they disconnected.")
		commandTableUnattend(ctx, s, &CommandData{ // nolint: exhaustivestruct
			TableID: ongoingGameTableID,
		})
	}

	for _, preGameTableID := range preGameTableIDs {
		logger.Info("Ejecting player \"" + s.Username + "\" from unstarted table " +
			strconv.FormatUint(preGameTableID, 10) + " since they disconnected.")
		commandTableLeave(ctx, s, &CommandData{ // nolint: exhaustivestruct
			TableID: preGameTableID,
		})
	}

	for _, spectatingTableID := range spectatingTableIDs {
		logger.Info("Ejecting spectator \"" + s.Username + "\" from table " +
			strconv.FormatUint(spectatingTableID.tableId, 10) + " since they disconnected.")
		commandTableUnattend(ctx, s, &CommandData{ // nolint: exhaustivestruct
			TableID: spectatingTableID.tableId,
		})

		// They might have been the last person spectating the table
		// If they were, the table will no longer exist
		// Check to see if the table still exists
		if _, ok := getTable(s, spectatingTableID.tableId, true); ok {
			// We want to add this relationship to the map of disconnected spectators
			// (so that the user will be automatically reconnected to the game if/when they
			// reconnect)

			tables.SetDisconSpectating(s.UserID, spectatingTableID.tableId, spectatingTableID.shadowId)
		}
	}
}
