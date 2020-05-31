package main

import (
	"strconv"
	"time"
)

// commandTagDelete is sent when a user types the "/tagdelete [tag]" command
//
// Example data:
// {
//   tableID: 123,
//   msg: 'inverted priority finesse',
// }
func commandTagDelete(s *Session, d *CommandData) {
	// Validate that the table exists
	tableID := d.TableID
	var t *Table
	if v, ok := tables[tableID]; !ok {
		s.Warning("Table " + strconv.Itoa(tableID) + " does not exist.")
		return
	} else {
		t = v
	}
	g := t.Game

	if !t.Running {
		s.Warning(ChatCommandNotStartedFail)
		return
	}

	// Sanitize and validate the tag
	if v, valid := sanitizeTag(s, d.Msg); !valid {
		return
	} else {
		d.Msg = v
	}

	if !t.Replay {
		// See if the tag exists
		if _, ok := g.Tags[d.Msg]; ok {
			delete(g.Tags, d.Msg)

			// Send them an acknowledgement via private message to avoid spoiling information about
			// the ongoing game
			s.Emit("chat", &ChatMessage{
				Msg:       "Successfully deleted the tag of \"" + d.Msg + "\".",
				Who:       "Hanabi Live",
				Datetime:  time.Now(),
				Room:      d.Room,
				Recipient: s.Username(),
			})
		} else {
			s.Warning("The tag of \"" + d.Msg + "\" does not exist on this game yet.")
		}
		return
	}

	// Get the existing tags from the database
	var tags []string
	if v, err := models.GameTags.GetAll(g.ID); err != nil {
		logger.Error("Failed to get the tags for game ID "+strconv.Itoa(g.ID)+":", err)
		s.Error(DefaultErrorMsg)
		return
	} else {
		tags = v
	}

	// Ensure that the tag exists
	if !stringInSlice(d.Msg, tags) {
		s.Warning("The tag of \"" + d.Msg + "\" does not exist on this game yet.")
		return
	}

	// Delete it from the database
	if err := models.GameTags.Delete(g.ID, d.Msg); err != nil {
		logger.Error("Failed to delete a tag for game ID "+strconv.Itoa(g.ID)+":", err)
		s.Error(DefaultErrorMsg)
		return
	}

	msg := s.Username() + " has deleted a game tag of \"" + d.Msg + "\"."
	room := "table" + strconv.Itoa(tableID)
	chatServerSend(msg, room)
}
