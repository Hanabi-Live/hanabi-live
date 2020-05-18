package main

import (
	"strconv"
)

// commandTableReattend is sent when the user clicks on the "Resume" button in the lobby
//
// Example data:
// {
//   tableID: 31,
// }
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

	// Validate that it is not a replay
	if t.Replay {
		s.Warning("You can not reattend a replay.")
		return
	}

	/*
		Reattend
	*/

	logger.Info(t.GetName() + "User \"" + s.Username() + "\" reattended.")

	if t.Running {
		// Make the client switch screens to show the game UI
		s.NotifyTableStart(t)
	} else {
		// Set their "present" variable back to true,
		// which will remove the "AWAY" if the game has not started yet
		// (if the game is running, this is handled in the "getGameInfo2()" function)
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
		// (if the game is running, this is handled in the "getGameInfo2()" function)
		chatSendPastFromTable(s, t)
	}

	// Set their status
	if s != nil {
		var status int
		if t.Running {
			status = StatusPlaying
		} else {
			status = StatusPregame
		}
		s.Set("status", status)
		notifyAllUser(s)
	}
}
