package main

import (
	"context"
)

// commandTableRemoveTimer is sent when a user types the "/removetimer" command
//
// Example data:
// {
//   tableID: 123,
//   options: {},
// }
func commandTableRemoveTimer(ctx context.Context, s *Session, d *CommandData) {
	t, exists := getTableAndLock(ctx, s, d.TableID, !d.NoTableLock, !d.NoTablesLock)
	if !exists {
		return
	}
	if !d.NoTableLock {
		defer t.Unlock(ctx)
	}

	if t.Running {
		s.Warning(StartedFail)
		return
	}

	if s.UserID != t.OwnerID {
		s.Warning(NotOwnerFail)
		return
	}

	// Validate that they sent the options object
	if d.Options == nil {
		d.Options = NewOptions()
	}

	tableRemoveTimer(ctx, s, d, t)
}

func tableRemoveTimer(ctx context.Context, s *Session, d *CommandData, t *Table) {
	// Set the timed to false
	t.Options.Timed = false

	// Even though no-one has joined or left the game, this function will update the display of the
	// variant on the client and refresh all of the variant-specific stats
	t.NotifyPlayerChange()

	// Update the variant in the table list for everyone in the lobby
	notifyAllTable(t)

	msg := s.Username + " has removed the game's timer. "
	chatServerSend(ctx, msg, t.GetRoomName(), d.NoTablesLock)
}
