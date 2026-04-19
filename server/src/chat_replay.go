package main

import (
	"context"
	"sort"
	"strconv"

	"github.com/Hanabi-Live/hanabi-live/logger"
)

// /suggest
func chatSuggest(ctx context.Context, s *Session, d *CommandData, t *Table, cmd string) {
	if t == nil || d.Room == "lobby" {
		chatServerSend(ctx, NotInGameFail, "lobby", d.NoTablesLock)
		return
	}

	if !t.Replay {
		chatServerSend(ctx, NotReplayFail, d.Room, d.NoTablesLock)
		return
	}

	// Validate that they only sent one argument
	if len(d.Args) != 1 {
		msg := "The format of the /suggest command is: /suggest [turn]"
		chatServerSend(ctx, msg, d.Room, d.NoTablesLock)
		return
	}

	// Validate that the argument is a number
	arg := d.Args[0]
	if _, err := strconv.Atoi(arg); err != nil {
		var msg string
		if _, err := strconv.ParseFloat(arg, 64); err != nil {
			msg = "\"" + arg + "\" is not a number."
		} else {
			msg = "The /suggest command only accepts integers."
		}
		chatServerSend(ctx, msg, d.Room, d.NoTablesLock)
		return
	}

	// The logic for this command is handled client-side
}

// /tags
func chatTags(ctx context.Context, s *Session, d *CommandData, t *Table, cmd string) {
	if t == nil || d.Room == "lobby" {
		chatServerSend(ctx, NotInGameFail, "lobby", d.NoTablesLock)
		return
	}

	if !t.Replay {
		chatServerSend(ctx, NotReplayFail, d.Room, d.NoTablesLock)
		return
	}

	// Snapshot the database ID, then release the lock before the DB call.
	// Making DB calls while holding t.Lock can exhaust the pgxpool and deadlock the server.
	databaseID := t.ExtraOptions.DatabaseID
	if !d.NoTableLock {
		t.Unlock(ctx)
	}

	// Get the tags from the database
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

	if !d.NoTableLock {
		t.Lock(ctx)
	}

	if len(tags) == 0 {
		msg := "There are not yet any tags for this game."
		chatServerSend(ctx, msg, d.Room, d.NoTablesLock)
		return
	}

	// We do not have to worry about doing a case-insensitive sort since all the tags should be
	// lowercase
	sort.Strings(tags)

	msg := "The list of tags for this game are as follows:"
	chatServerSend(ctx, msg, d.Room, d.NoTablesLock)
	for i, tag := range tags {
		msg := strconv.Itoa(i+1) + ") " + tag
		chatServerSend(ctx, msg, d.Room, d.NoTablesLock)
	}
}
