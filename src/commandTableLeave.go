package main

import (
	"strconv"
	"time"
)

// commandTableLeave is sent when the user clicks on the "Leave Game" button in the lobby
//
// Example data:
// {
//   tableID: 5,
// }
func commandTableLeave(s *Session, d *CommandData) {
	/*
		Validation
	*/

	// Validate that the table exists
	tableID := d.TableID
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

	// If they were typing, remove the message
	t.NotifyChatTyping(s.Username(), false)

	// If there is an automatic start countdown, cancel it
	if !t.DatetimePlannedStart.IsZero() {
		t.DatetimePlannedStart = time.Time{} // Assign a zero value
		room := "table" + strconv.Itoa(t.ID)
		chatServerSend("Automatic game start has been canceled.", room)
	}

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
			s2 := p.Session
			if s2 == nil {
				// A player's session should never be nil
				// They might be in the process of reconnecting,
				// so make a fake session that will represent them
				s2 = newFakeSession(p.ID, p.Name, t.ID)
			}
			commandTableLeave(s2, &CommandData{
				TableID: t.ID,
			})
		}
		return
	}

	if len(t.Players) == 0 {
		// Delete the game if this is the last person to leave
		delete(tables, tableID)
		notifyAllTableGone(t)
		return
	}
}
