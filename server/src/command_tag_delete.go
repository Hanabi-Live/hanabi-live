package main

import (
	"context"
	"strconv"

	"github.com/Hanabi-Live/hanabi-live/logger"
)

// commandTagDelete is sent when a user types the "/tagdelete [tag]" command
//
// Example data:
//
//	{
//	  tableID: 123,
//	  msg: 'inverted priority finesse',
//	}
func commandTagDelete(ctx context.Context, s *Session, d *CommandData) {
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

	// Sanitize, validate, and normalize the tag
	if v, err := sanitizeTag(d.Msg); err != "" {
		s.Warning(err)
		return
	} else {
		d.Msg = v
	}

	tagDelete(ctx, s, d, t)
}

func tagDelete(ctx context.Context, s *Session, d *CommandData, t *Table) {
	// Local variables
	g := t.Game

	if !t.Replay {
		// See if the tag exists
		if _, ok := g.Tags[d.Msg]; ok {
			delete(g.Tags, d.Msg)

			// Send them an acknowledgement via private message to avoid spoiling information about
			// the ongoing game
			msg := "Successfully deleted the tag of \"" + d.Msg + "\"."
			chatServerSendPM(s, msg, d.Room)
		} else {
			s.Warning("The tag of \"" + d.Msg + "\" does not exist on this game yet.")
		}
		return
	}

	// Snapshot the values we need, then release the lock before DB calls.
	// Making DB calls while holding t.Lock can exhaust the pgxpool and deadlock the server.
	databaseID := t.ExtraOptions.DatabaseID
	roomName := t.GetRoomName()
	if !d.NoTableLock {
		t.Unlock(ctx)
	}

	// Get the existing tags from the database
	var tags []string
	if v, err := models.GameTags.GetAll(databaseID); err != nil {
		logger.Error("Failed to get the tags for game ID " +
			strconv.Itoa(databaseID) + ": " + err.Error())
		if !d.NoTableLock {
			t.Lock(ctx)
		}
		s.Error(DefaultErrorMsg)
		return
	} else {
		tags = v
	}

	// Ensure that the tag exists
	if !stringInSlice(d.Msg, tags) {
		if !d.NoTableLock {
			t.Lock(ctx)
		}
		s.Warning("The tag of \"" + d.Msg + "\" does not exist on this game yet.")
		return
	}

	// Delete it from the database
	if err := models.GameTags.Delete(databaseID, d.Msg); err != nil {
		logger.Error("Failed to delete a tag for game ID " +
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
	msg := s.Username + " has deleted a game tag of \"" + d.Msg + "\"."
	chatServerSend(ctx, msg, roomName, d.NoTablesLock)
}
