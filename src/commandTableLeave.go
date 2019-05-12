/*
	Sent when the user clicks on the "Leave Table" button in the lobby
	"data" is empty
*/

package main

import "strconv"

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

	// Validate that the table has not started
	if t.Game.Running {
		s.Warning("That table has already started, so you cannot leave it.")
		return
	}

	// Validate that they are in the table
	i := t.GameSpec.GetPlayerIndex(s.UserID())
	if i == -1 {
		s.Warning("You are not in table " + strconv.Itoa(tableID) + ", so you cannot leave it.")
		return
	}

	/*
		Leave
	*/

	log.Info(
		t.GetName() +
			"User \"" + s.Username() + "\" left. " +
			"(There are now " + strconv.Itoa(len(t.GameSpec.Players)-1) + " players.)",
	)

	// Remove the player
	t.GameSpec.Players = append(t.GameSpec.Players[:i], t.GameSpec.Players[i+1:]...)
	notifyAllTable(t)
	t.NotifyPlayerChange()

	// Set their status
	s.Set("currentTable", -1)
	s.Set("status", statusLobby)
	notifyAllUser(s)

	// Make the client switch screens to show the base lobby
	s.Emit("tableLeave", nil)

	// Force everyone else to leave if it was the owner that left
	if s.UserID() == t.Owner && len(t.GameSpec.Players) > 0 {
		for len(t.GameSpec.Players) > 0 {
			p := t.GameSpec.Players[0]
			p.Session.Set("currentTable", t.ID)
			commandTableLeave(p.Session, d)
		}
		return
	}

	if len(t.GameSpec.Players) == 0 {
		// Delete the table if this is the last person to leave
		delete(tables, tableID)
		notifyAllTableGone(t)
		return
	}

	// Send the table owner whether or not the "Start Table" button should be grayed out
	t.NotifyTableReady()
}
