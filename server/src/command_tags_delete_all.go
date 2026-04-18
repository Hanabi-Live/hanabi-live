package main

import (
	"context"
	"strconv"

	"github.com/Hanabi-Live/hanabi-live/logger"
)

// commandTagsDeleteAll is sent when a user types the "/tagsdeleteall" command
//
// Example data:
// {
//   tableID: 123,
//   msg: 'inverted priority finesse',
// }
func commandTagsDeleteAll(ctx context.Context, s *Session, d *CommandData) {
	t, exists := getTableAndLock(ctx, s, d.TableID, !d.NoTableLock, !d.NoTablesLock)
	if !exists {
		return
	}
	if !d.NoTableLock {
		defer t.Unlock(ctx)
	}

	if !t.Running {
		s.Warning(NotStartedFail)
		return
	}

	tagsDeleteAll(ctx, s, d, t)
}

func tagsDeleteAll(ctx context.Context, s *Session, d *CommandData, t *Table) {
	// Local variables
	g := t.Game

	if !t.Replay {
		// Clear all tags
		g.Tags = make(map[string]int)
		msg := "Successfully deleted the all the game's tags."
		chatServerSendPM(s, msg, d.Room)
		return
	}

	// Snapshot the values we need, then release the lock before the DB call.
	// Making DB calls while holding t.Lock can exhaust the pgxpool and deadlock the server.
	databaseID := t.ExtraOptions.DatabaseID
	roomName := t.GetRoomName()
	if !d.NoTableLock {
		t.Unlock(ctx)
	}

	// Delete all tags from the database
	if err := models.GameTags.DeleteAll(s.UserID, databaseID); err != nil {
		logger.Error("Failed to delete all tags for game ID " +
			strconv.Itoa(databaseID) + ": " + err.Error())
		if !d.NoTableLock {
			t.Lock(ctx)
		}
		s.Error(DefaultErrorMsg)
		return
	}

	if !d.NoTableLock {
		t.Lock(ctx)
	}
	msg := s.Username + " has deleted all their tags for this game."
	chatServerSend(ctx, msg, roomName, d.NoTablesLock)
}
