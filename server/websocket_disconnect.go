package main

import (
	"context"

	"github.com/Zamiell/hanabi-live/server/pkg/util"
	"github.com/gabstv/melody"
)

func websocketDisconnect(ms *melody.Session) {
	/*
		ctx := NewSessionContext(s)

		websocketDisconnectRemoveFromGames(ctx, s)

		// Alert everyone that a user has logged out
		notifyAllUserLeft(s)
	*/
}

func websocketDisconnectRemoveFromGames(ctx context.Context, s *Session) {
	// Look for the disconnecting player in all of the tables
	ongoingGameTableIDs := make([]uint64, 0)
	preGameTableIDs := make([]uint64, 0)
	spectatingTableIDs := make([]uint64, 0)

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
		spectatorIndex := t.GetSpectatorIndexFromID(s.UserID)
		if spectatorIndex != -1 {
			spectatingTableIDs = append(spectatingTableIDs, t.ID)
		}

		t.Unlock(ctx)
	}

	for _, ongoingGameTableID := range ongoingGameTableIDs {
		hLog.Infof(
			"Unattending %v from ongoing table %v since they disconnected.",
			util.PrintUser(s.UserID, s.Username),
			ongoingGameTableID,
		)
		commandTableUnattend(ctx, s, &CommandData{ // nolint: exhaustivestruct
			TableID: ongoingGameTableID,
		})
	}

	for _, preGameTableID := range preGameTableIDs {
		hLog.Infof(
			"Ejecting %v from unstarted table %v since they disconnected.",
			util.PrintUser(s.UserID, s.Username),
			preGameTableID,
		)
		commandTableLeave(ctx, s, &CommandData{ // nolint: exhaustivestruct
			TableID: preGameTableID,
		})
	}

	for _, spectatingTableID := range spectatingTableIDs {
		hLog.Infof(
			"Ejecting spectator %v from table %v since they disconnected.",
			util.PrintUser(s.UserID, s.Username),
			spectatingTableID,
		)
		commandTableUnattend(ctx, s, &CommandData{ // nolint: exhaustivestruct
			TableID: spectatingTableID,
		})

		// They might have been the last person spectating the table
		// If they were, the table will no longer exist
		// Check to see if the table still exists
		if _, ok := getTable(s, spectatingTableID, true); ok {
			// We want to add this relationship to the map of disconnected spectators
			// (so that the user will be automatically reconnected to the game if/when they
			// reconnect)
			tables.SetDisconSpectating(s.UserID, spectatingTableID)
		}
	}
}
