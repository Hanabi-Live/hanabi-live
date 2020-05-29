package main

import (
	"sort"
	"strconv"
)

// /tags
func chatTags(s *Session, d *CommandData, t *Table) {
	if d.Room == "lobby" {
		chatServerSend(ChatCommandNotInGameFail, d.Room)
		return
	}

	if !t.Replay {
		chatServerSend(ChatCommandNotReplayFail, d.Room)
		return
	}

	// Local variables
	g := t.Game

	// Get the tags from the database
	var tags []string
	if v, err := models.GameTags.GetAll(g.ID); err != nil {
		logger.Error("Failed to get the tags for game ID "+strconv.Itoa(g.ID)+":", err)
		s.Error(DefaultErrorMsg)
		return
	} else {
		tags = v
	}

	if len(tags) == 0 {
		chatServerSend("There are not yet any tags for this game.", d.Room)
		return
	}

	sort.Strings(tags)

	chatServerSend("The list of tags for this game are as follows:", d.Room)
	for i, tag := range tags {
		msg := strconv.Itoa(i+1) + ") " + tag
		chatServerSend(msg, d.Room)
	}
}
