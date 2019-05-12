/*
	Sent when the user clicks on the "Resume" button in the lobby
	"data" example:
	{
		tableID: 31,
	}
*/

package main

import (
	"strconv"
)

func commandGameReattend(s *Session, d *CommandData) {
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

	// Validate that they are in the table
	i := t.GameSpec.GetPlayerIndex(s.UserID())
	if i == -1 {
		s.Warning("You are not in table " + strconv.Itoa(tableID) + ", so you cannot reattend it.")
		return
	}

	/*
		Reattend
	*/

	log.Info(t.GetName() + "User \"" + s.Username() + "\" reattended.")

	// Set their "present" variable back to true, which will remove the "AWAY" if the table has not started yet
	// (if the table is running, this is handled in the "commandReady()" function)
	p := t.GameSpec.Players[i]
	if !t.Game.Running {
		p.Present = true
		t.NotifyPlayerChange()
	}

	// Set their status
	s.Set("currentTable", tableID)
	if t.Game.Running {
		s.Set("status", statusPlaying)
	} else {
		s.Set("status", statusPregame)
	}
	notifyAllUser(s)

	// Let the client know they successfully joined the table
	type JoinedMessage struct {
		ID int `json:"tableID"`
	}
	s.Emit("tableJoin", &JoinedMessage{
		ID: tableID,
	})

	// Send them the chat history for this table
	// (if the table is running, this is handled in the "commandReady()" function)
	if !t.Game.Running {
		chatSendPastFromTable(s, t)
	}

	if t.Game.Running {
		// Make the client switch screens to show the table UI
		s.NotifyTableStart()
	} else {
		// Send the table owner whether or not the "Start Table" button should be grayed out
		t.NotifyTableReady()
	}
}
