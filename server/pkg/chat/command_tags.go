package chat

import (
	"fmt"
	"sort"

	"github.com/Zamiell/hanabi-live/server/pkg/models"
)

// /tags
func (m *Manager) commandTags() {
	if t == nil || d.Room == "lobby" {
		chatServerSend(ctx, NotInGameFail, "lobby", d.NoTablesLock)
		return
	}

	if !t.Replay {
		chatServerSend(ctx, NotReplayFail, d.Room, d.NoTablesLock)
		return
	}

	// Get the tags from the database
	var tags []string
	if v, err := models.GameTags.GetAll(t.ExtraOptions.DatabaseID); err != nil {
		hLog.Errorf(
			"Failed to get the tags for game ID %v: %v",
			t.ExtraOptions.DatabaseID,
			err,
		)
		s.Error(DefaultErrorMsg)
		return
	} else {
		tags = v
	}

	if len(tags) == 0 {
		msg := "There are not yet any tags for this game."
		chatServerSend(ctx, msg, d.Room, d.NoTablesLock)
		return
	}

	// We don't have to worry about doing a case-insensitive sort since all the tags should be
	// lowercase
	sort.Strings(tags)

	msg := "The list of tags for this game are as follows:"
	chatServerSend(ctx, msg, d.Room, d.NoTablesLock)
	for i, tag := range tags {
		msg := fmt.Sprintf("%v) %v", i+1, tag)
		chatServerSend(ctx, msg, d.Room, d.NoTablesLock)
	}
}
