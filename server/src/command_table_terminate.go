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
	t, exists := getTableAndLock(s, d.TableID, !d.NoLock)
	if !exists {
		return
	}
	if !d.NoLock {
		defer t.Mutex.Unlock()
	}

	// Validate that they are in the game
	playerIndex := t.GetPlayerIndexFromID(s.UserID)
	if playerIndex == -1 {
		s.Warning("You are not playing at table " + strconv.FormatUint(t.ID, 10) + ", " +
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

	terminate(s, t, playerIndex)
}

func terminate(s *Session, t *Table, playerIndex int) {
	commandAction(s, &CommandData{ // Manual invocation
		TableID: t.ID,
		Type:    ActionTypeEndGame,
		Target:  playerIndex,
		Value:   EndConditionTerminated,
		NoLock:  true,
	})
}
