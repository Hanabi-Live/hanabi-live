package main

import (
	"context"
)

// commandChatRead is sent when the user opens the in-game chat or
// when they receive a chat message when the in-game chat is already open
//
// Example data:
//
//	{
//	  tableID: 5,
//	}
func commandChatRead(ctx context.Context, s *Session, d *CommandData) {
	t, exists := getTableAndLock(ctx, s, d.TableID, !d.NoTableLock, !d.NoTablesLock)
	if !exists {
		return
	}
	if !d.NoTableLock {
		defer t.Unlock(ctx)
	}

	// Validate that they are in the game or are a spectator
	if !t.IsPlayerOrSpectating(s.UserID) {
		// Return without an error message if they are not playing or spectating at the table
		// (to account for lag)
		return
	}
	if !t.IsActivelySpectating(s.UserID) && t.Replay {
		// Return without an error message if they are not spectating at the replay
		// (to account for lag)
		return
	}

	// Mark that they have read all of the in-game chat
	t.ChatRead[s.UserID] = len(t.Chat)
}
