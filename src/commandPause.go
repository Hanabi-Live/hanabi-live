/*
	Sent when the user pauses or unpauses the table
	"data" example:
	{
		value: 'pause', // Can also be 'unpause', 'pause-queue', 'pause-unqueue'
		// ('pause-queue' will automatically pause the table when it gets to their turn)
	}
*/

package main

import (
	"strconv"
	"time"
)

func commandPause(s *Session, d *CommandData) {
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

	// Validate that the table has started
	if !t.Game.Running {
		s.Warning("Table " + strconv.Itoa(tableID) + " has not started yet.")
		return
	}

	// Validate that they are in the table
	i := t.GameSpec.GetPlayerIndex(s.UserID())
	if i == -1 {
		s.Warning("You are in not table " + strconv.Itoa(tableID) + ", so you cannot send a note.")
		return
	}
	p := t.GameSpec.Players[i]

	// Validate that it is a timed table
	if !t.GameSpec.Options.Timed {
		s.Warning("This is not a timed table, so you cannot pause / unpause.")
		return
	}

	// If a player requests a queued pause on their turn, turn it into a normal pause
	if d.Value == "pause-queue" && t.Game.ActivePlayer == i {
		d.Value = "pause"
	}

	// Validate the value
	if d.Value == "pause" {
		if t.Game.Paused {
			s.Warning("The table is already paused.")
			return
		}
	} else if d.Value == "unpause" {
		if !t.Game.Paused {
			s.Warning("The table is not paused, so you cannot unpause.")
			return
		}
	} else if d.Value == "pause-queue" {
		if p.RequestedPause {
			s.Warning("You have already requested a pause when it gets to your turn.")
			return
		}
	} else if d.Value == "pause-unqueue" {
		if !p.RequestedPause {
			s.Warning("You have not requested a pause, so you cannot unqueue one.")
			return
		}
	} else {
		s.Warning("That is not a valid value.")
		return
	}

	/*
		Pause
	*/

	if d.Value == "pause-queue" {
		p.RequestedPause = true
		return
	}
	if d.Value == "pause-unqueue" {
		p.RequestedPause = false
		return
	}

	if d.Value == "pause" {
		t.Game.Paused = true
		t.Game.PauseTime = time.Now()
		t.Game.PauseCount++
		t.Game.PausePlayer = i
	} else if d.Value == "unpause" {
		t.Game.Paused = false

		// Add the time elapsed during the pause to the time recorded when the turn began
		// (because we use this as a differential to calculate how much time the player took when
		// they end their turn)
		t.Game.TurnBeginTime = t.Game.TurnBeginTime.Add(time.Since(t.Game.PauseTime))

		// Send everyone new clock values
		t.NotifyTime()

		// Restart the function that will check to see if the current player has run out of time
		// (since the existing function will return and do nothing if the table is paused)
		go t.CheckTimer(t.Game.Turn, t.Game.PauseCount, t.GameSpec.Players[t.Game.ActivePlayer])
	}

	t.NotifyPause()

	// Also send a chat message about it
	msg := s.Username() + " "
	if t.Game.Paused {
		msg += "un"
	}
	msg += "paused the table."
	chatServerPregameSend(msg, t.ID)
}
