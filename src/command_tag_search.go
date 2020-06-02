package main

import (
	"strconv"
	"strings"
	"time"
)

// commandTagSearch is sent when a user types the "/tagsearch [tag]" command
//
// Example data:
// {
//   msg: 'inverted priority finesse',
// }
func commandTagSearch(s *Session, d *CommandData) {
	// Sanitize, validate, and normalize the tag
	if v, err := sanitizeTag(d.Msg); err != nil {
		s.Warning(err.Error())
		return
	} else {
		d.Msg = v
	}

	// Search through the database for games matching this tag
	var gameIDs []int
	if v, err := models.GameTags.Search(d.Msg); err != nil {
		logger.Error("Failed to search for games matching a tag of \""+d.Msg+"\":", err)
		s.Error(DefaultErrorMsg)
		return
	} else {
		gameIDs = v
	}

	gameIDStrings := make([]string, 0)
	for _, gameID := range gameIDs {
		gameIDStrings = append(gameIDStrings, strconv.Itoa(gameID))
	}

	// Send the results via a private message as to not spam public channels
	msg := "Games matching \"" + d.Msg + "\": " + strings.Join(gameIDStrings, ", ")
	s.Emit("chat", &ChatMessage{
		Msg:       msg,
		Who:       "Hanabi Live",
		Datetime:  time.Now(),
		Room:      d.Room,
		Recipient: s.Username(),
	})
}
