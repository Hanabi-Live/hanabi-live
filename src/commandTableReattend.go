/*
	Sent when the user clicks on the "Resume" button in the lobby
	"data" example:
	{
		gameID: 31,
	}
*/

package main

import (
	"strconv"
)

func commandTableReattend(s *Session, d *CommandData) {
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

	// Validate that they are at the table
	i := t.GetPlayerIndexFromID(s.UserID())
	if i == -1 {
		s.Warning("You are not playing at table " + strconv.Itoa(tableID) + ", " +
			"so you cannot reattend it.")
		return
	}

	/*
		Reattend
	*/

	logger.Info(t.GetName() + "User \"" + s.Username() + "\" reattended.")

	if t.Running {
		// Make the client switch screens to show the game UI
		s.NotifyTableStart()
	} else {
		// Set their "present" variable back to true, which will remove the "AWAY" if the game has not started yet
		// (if the game is running, this is handled in the "commandReady()" function)
		p := t.Players[i]
		p.Present = true
		t.NotifyPlayerChange()

		// Let the client know they successfully joined the table
		type JoinedMessage struct {
			ID int `json:"tableID"`
		}
		s.Emit("joined", &JoinedMessage{
			ID: tableID,
		})

		// Send them the chat history for this game
		// (if the game is running, this is handled in the "commandReady()" function)
		chatSendPastFromTable(s, t)

		// Send the table owner whether or not the "Start Game" button should be grayed out
		t.NotifyTableReady()
	}

	// Set their status
	s.Set("currentTable", tableID)
	if t.Running {
		s.Set("status", statusPlaying)
	} else {
		s.Set("status", statusPregame)
	}
	notifyAllUser(s)
}
