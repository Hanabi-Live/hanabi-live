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
	t, exists := getTableAndLock(s, d.TableID, !d.NoLock)
	if !exists {
		return
	}
	if !d.NoLock {
		defer t.Mutex.Unlock()
	}

	// Validate that they are at the table
	playerIndex := t.GetPlayerIndexFromID(s.UserID)
	if playerIndex == -1 {
		s.Warning("You are not playing at table " + strconv.FormatUint(t.ID, 10) + ", " +
			"so you cannot reattend it.")
		return
	}

	// Validate that it is not a replay
	if t.Replay {
		s.Warning("You can not reattend a replay.")
		return
	}

	tableReattend(s, t, playerIndex)
}

func tableReattend(s *Session, t *Table, playerIndex int) {
	logger.Info(t.GetName() + "User \"" + s.Username + "\" reattended.")

	// They might be reconnecting after a disconnect,
	// so update the player object with the new socket
	t.Players[playerIndex].Session = s

	if t.Running {
		// Make the client switch screens to show the game UI
		s.NotifyTableStart(t)
	} else {
		// Set their "present" variable back to true,
		// which will remove the "AWAY" if the game has not started yet
		// (if the game is running, this is handled in the "getGameInfo2()" function)
		p := t.Players[playerIndex]
		p.Present = true
		t.NotifyPlayerChange()

		// Let the client know they successfully joined the table
		s.NotifyTableJoined(t)

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
		s.SetStatus(status)
		s.SetTableID(t.ID)
		notifyAllUser(s)
	}
}
