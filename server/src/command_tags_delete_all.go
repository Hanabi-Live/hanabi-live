package main

import (
	"context"
	"strconv"
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

	// Delete it from the database
	if err := models.GameTags.DeleteAll(t.ExtraOptions.DatabaseID); err != nil {
		logger.Error("Failed to delete all tags for game ID " +
			strconv.Itoa(t.ExtraOptions.DatabaseID) + ": " + err.Error())
		s.Error(DefaultErrorMsg)
		return
	}

	msg := s.Username + " has deleted the game's tags."
	chatServerSend(ctx, msg, t.GetRoomName(), d.NoTablesLock)
}
