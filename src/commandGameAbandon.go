/*
	Sent when the user clicks the "X" button in the bottom-left-hand corner
	"data" is empty
*/

package main

import (
	"strconv"
)

func commandGameAbandon(s *Session, d *CommandData) {
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

	// Validate that they are in the table
	i := t.GameSpec.GetPlayerIndex(s.UserID())
	if i == -1 {
		s.Warning("You are in not table " + strconv.Itoa(tableID) + ", so you cannot abandon it.")
		return
	}

	// Validate that it is not a replay
	if t.Game.Replay {
		s.Warning("You can not abandon a replay.")
		return
	}

	/*
		Abandon
	*/

	if !t.Game.Running {
		// Just make them leave the table instead
		s.Set("currentTable", t.ID)
		s.Set("status", statusPregame)
		commandTableLeave(s, d)
		return
	}

	// We want to set the end condition before advancing the turn to ensure that
	// no active player will show
	t.Game.EndCondition = endConditionAbandoned

	// Add a text message for the termination
	// and put it on its own turn so that it is separate from the final times
	text := s.Username() + " terminated the table!"
	t.Game.Actions = append(t.Game.Actions, ActionText{
		Type: "text",
		Text: text,
	})
	t.NotifyAction()
	t.Game.Turn++
	t.NotifyTurn()

	// Play a sound to indicate that the table was terminated
	t.Game.Sound = "finished_fail"
	t.NotifySound()

	// End the table and write it to the database
	t.End()
}
