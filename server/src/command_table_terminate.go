package main

import (
	"strconv"
)

// commandTableTerminate is sent when the user clicks the terminate button in the bottom-left-hand
// corner
//
// Example data:
// {
//   tableID: 5,
//   server: true, // True if a server-initiated termination, otherwise omitted
// }
func commandTableTerminate(s *Session, d *CommandData) {
	/*
		Validate
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

	// Validate that they are in the game
	i := t.GetPlayerIndexFromID(s.UserID())
	if i == -1 {
		s.Warning("You are not playing at table " + strconv.Itoa(tableID) + ", " +
			"so you cannot terminate it.")
		return
	}

	// Validate that the game has started
	if !t.Running {
		s.Warning("You can not terminate a game that has not started yet.")
		return
	}

	// Validate that it is not a replay
	if t.Replay {
		s.Warning("You can not terminate a replay.")
		return
	}

	/*
		Terminate
	*/

	commandAction(s, &CommandData{
		TableID: t.ID,
		Type:    ActionTypeGameOver,
		Target:  i,
		Value:   EndConditionTerminated,
	})
}
