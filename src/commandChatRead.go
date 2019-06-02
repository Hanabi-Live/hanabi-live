/*
	Sent when the user opens the in-table chat
	"data" is empty
*/

package main

import (
	"strconv"
)

func commandChatRead(s *Session, d *CommandData) {
	/*
		Validate
	*/

	// Validate that the table exists
	tableID := s.CurrentTable()
	var t *Table
	if v, ok := tables[tableID]; !ok {
		s.Warning("Table " + strconv.Itoa(tableID) + " does not exist.")
		return
	} else {
		t = v
	}

	// Validate that the table has started
	if !t.Game.Running {
		s.Warning("Table " + strconv.Itoa(tableID) + " has not started yet.")
		return
	}

	// Validate that they are in the table or are a spectator
	if t.GameSpec.GetPlayerIndex(s.UserID()) == -1 && t.GetSpectatorIndex(s.UserID()) == -1 {
		s.Warning("You are not playing or spectating table " + strconv.Itoa(tableID) + ", so you cannot acknowledge its chat.")
		return
	}

	/*
		Mark that they have read all of the in-table chat
	*/

	t.ChatRead[s.UserID()] = len(t.Chat)
}
