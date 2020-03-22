/*
	Sent when the user clicks on the "Leave Game" button in the lobby
	"data" is empty
*/

package main

import (
	"strconv"
	"time"
)

func commandTableLeave(s *Session, d *CommandData) {
	/*
		Validation
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

	// Validate that the game has not started
	if t.Running {
		s.Warning("That game has already started, so you cannot leave it.")
		return
	}

	// Validate that they are at the table
	i := t.GetPlayerIndexFromID(s.UserID())
	if i == -1 {
		s.Warning("You are not at table " + strconv.Itoa(tableID) + ", so you cannot leave it.")
		return
	}

	/*
		Leave
	*/

	logger.Info(t.GetName() + "User \"" + s.Username() + "\" left. " +
		"(There are now " + strconv.Itoa(len(t.Players)-1) + " players.)")

	// Remove the player
	t.Players = append(t.Players[:i], t.Players[i+1:]...)
	notifyAllTable(t)
	t.NotifyPlayerChange()

	// Set their status
	s.Set("currentTable", -1)
	s.Set("status", statusLobby)
	notifyAllUser(s)

	// Make the client switch screens to show the base lobby
	s.Emit("left", nil)

	// Force everyone else to leave if it was the owner that left
	if s.UserID() == t.Owner && len(t.Players) > 0 {
		for len(t.Players) > 0 {
			p := t.Players[0]
			p.Session.Set("currentTable", t.ID)
			commandTableLeave(p.Session, d)
		}
		return
	}

	if len(t.Players) == 0 {
		// Delete the game if this is the last person to leave
		delete(tables, tableID)
		notifyAllTableGone(t)
		return
	}

	// Send the table owner whether or not the "Start Game" button should be grayed out
	t.NotifyTableReady()

	// If there is an automatic start countdown, cancel it
	if !t.DatetimePlannedStart.IsZero() {
		t.DatetimePlannedStart = time.Time{} // Assign a zero value
		room := "table" + strconv.Itoa(t.ID)
		chatServerSend("Automatic game start has been canceled.", room)
	}
}
