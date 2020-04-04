/*
	Sent when the user clicks the "X" button in the bottom-left-hand corner
	"data" is empty
*/

package main

import (
	"strconv"
)

func commandTableTerminate(s *Session, d *CommandData) {
	/*
		Validate
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
	g := t.Game

	// Validate that they are in the game
	i := t.GetPlayerIndexFromID(s.UserID())
	if i == -1 {
		s.Warning("You are not playing at table " + strconv.Itoa(tableID) + ", " +
			"so you cannot terminate it.")
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

	if !t.Running {
		// Just make them leave the game instead
		s.Set("currentTable", t.ID)
		s.Set("status", statusPregame)
		commandTableLeave(s, d)
		return
	}

	// We want to set the end condition before advancing the turn to ensure that
	// no active player will show
	g.EndCondition = endConditionTerminated

	// Add a text message for the termination
	// and put it on its own turn so that it is separate from the final times
	text := s.Username() + " terminated the game!"
	g.Actions = append(g.Actions, ActionText{
		Type: "text",
		Text: text,
	})
	t.NotifyAction()
	g.Turn++
	t.NotifyTurn()

	// Play a sound to indicate that the game was terminated
	g.Sound = "finished_fail"
	t.NotifySound()

	// End the game and write it to the database
	g.End()
}
