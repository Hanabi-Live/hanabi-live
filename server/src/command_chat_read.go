package main

import (
	"strconv"
)

// commandChatRead is sent when the user opens the in-game chat or
// when they receive a chat message when the in-game chat is already open
//
// Example data:
// {
//   tableID: 5,
// }
func commandChatRead(s *Session, d *CommandData) {
	// Validate that the table exists
	tableID := d.TableID
	var t *Table
	if v, ok := tables[tableID]; !ok {
		s.Warning("Table " + strconv.FormatUint(tableID, 10) + " does not exist.")
		return
	} else {
		t = v
	}

	// Validate that they are in the game or are a spectator
	i := t.GetPlayerIndexFromID(s.UserID())
	j := t.GetSpectatorIndexFromID(s.UserID())
	if i == -1 && j == -1 {
		// Return without an error message if they are not playing or spectating at the table
		// (to account for lag)
		return
	}
	if t.Replay && j == -1 {
		// Return without an error message if they are not spectating at the replay
		// (to account for lag)
		return
	}

	// Mark that they have read all of the in-game chat
	t.ChatRead[s.UserID()] = len(t.Chat)
}
