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

	if d.Server {
		i = -1
	}
	terminate(t, s.Username(), i)
}

func terminate(t *Table, username string, endPlayerIndex int) {
	// Local variables
	g := t.Game

	// We want to set the end condition before advancing the turn to ensure that
	// no active player will show
	g.EndCondition = EndConditionTerminated
	g.EndPlayer = endPlayerIndex

	// Append a game over action
	g.Actions = append(g.Actions, ActionGameOver{
		Type:         "gameOver",
		EndCondition: g.EndCondition,
		PlayerIndex:  g.EndPlayer,
	})
	t.NotifyGameAction()

	// TODO remove this when the client uses state for the replays instead of "globals.replayLog"
	g.Turn++
	t.NotifyTurn()

	// Play a sound to indicate that the game was terminated
	g.Sound = "finished_fail"
	t.NotifySound()

	// End the game and write it to the database
	g.End()
}
