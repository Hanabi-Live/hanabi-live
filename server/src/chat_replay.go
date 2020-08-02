package main

import (
	"sort"
	"strconv"
)

// /suggest
func chatSuggest(s *Session, d *CommandData, t *Table) {
	if t == nil || d.Room == "lobby" {
		chatServerSend(ChatCommandNotInGameFail, d.Room)
		return
	}

	if !t.Replay {
		chatServerSend(ChatCommandNotReplayFail, d.Room)
		return
	}

	// Validate that they only sent one argument
	if len(d.Args) != 1 {
		chatServerSend("The format of the /suggest command is: /suggest [turn]", d.Room)
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
		chatServerSend(msg, d.Room)
		return
	}

	// The logic for this command is handled client-side
}

// /tags
func chatTags(s *Session, d *CommandData, t *Table) {
	if t == nil || d.Room == "lobby" {
		chatServerSend(ChatCommandNotInGameFail, d.Room)
		return
	}

	if !t.Replay {
		chatServerSend(ChatCommandNotReplayFail, d.Room)
		return
	}

	// Get the tags from the database
	var tags []string
	if v, err := models.GameTags.GetAll(t.ExtraOptions.DatabaseID); err != nil {
		logger.Error("Failed to get the tags for game ID "+
			strconv.Itoa(t.ExtraOptions.DatabaseID)+":", err)
		s.Error(DefaultErrorMsg)
		return
	} else {
		tags = v
	}

	if len(tags) == 0 {
		chatServerSend("There are not yet any tags for this game.", d.Room)
		return
	}

	// We don't have to worry about doing a case-insensitive sort since all the tags should be
	// lowercase
	sort.Strings(tags)

	chatServerSend("The list of tags for this game are as follows:", d.Room)
	for i, tag := range tags {
		msg := strconv.Itoa(i+1) + ") " + tag
		chatServerSend(msg, d.Room)
	}
}
