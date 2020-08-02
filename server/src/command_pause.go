package main

import (
	"strconv"
	"time"
)

// commandPause is sent when the user pauses or unpauses the game
//
// Example data:
// {
//   tableID: 5,
//   setting: 'pause', // Can also be 'unpause', 'pause-queue', 'pause-unqueue'
//   // ('pause-queue' will automatically pause the game when it gets to their turn)
// }
func commandPause(s *Session, d *CommandData) {
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
	g := t.Game

	// Validate that the game has started
	if !t.Running {
		s.Warning(ChatCommandNotStartedFail)
		return
	}

	// Validate that it is not a replay
	if t.Replay {
		s.Warning("You can not pause or unpause in a replay.")
		return
	}

	// Validate that they are in the game
	i := t.GetPlayerIndexFromID(s.UserID())
	if i == -1 {
		s.Warning("You are not at table " + strconv.Itoa(tableID) + ", " +
			"so you cannot pause / unpause.")
		return
	}
	p := g.Players[i]

	// Validate that it is a timed game
	if !t.Options.Timed {
		s.Warning("This is not a timed game, so you cannot pause / unpause.")
		return
	}

	// If a player requests a queued pause on their turn, turn it into a normal pause
	if d.Setting == "pause-queue" && g.ActivePlayerIndex == i {
		d.Setting = "pause"
	}

	// Validate the setting
	if d.Setting == "pause" {
		if g.Paused {
			s.Warning("The game is already paused.")
			return
		}
	} else if d.Setting == "unpause" {
		if !g.Paused {
			s.Warning("The game is not paused, so you cannot unpause.")
			return
		}
	} else if d.Setting == "pause-queue" {
		if p.RequestedPause {
			s.Warning("You have already requested a pause when it gets to your turn.")
			return
		}
	} else if d.Setting == "pause-unqueue" {
		if !p.RequestedPause {
			s.Warning("You have not requested a pause, so you cannot unqueue one.")
			return
		}
	} else {
		s.Warning("That is not a valid setting.")
		return
	}

	/*
		Pause
	*/

	if d.Setting == "pause-queue" {
		p.RequestedPause = true
		return
	}
	if d.Setting == "pause-unqueue" {
		p.RequestedPause = false
		return
	}

	if d.Setting == "pause" {
		g.Paused = true
		g.PauseTime = time.Now()
		g.PauseCount++
		g.PausePlayerIndex = i
	} else if d.Setting == "unpause" {
		g.Paused = false

		// Add the time elapsed during the pause to the time recorded when the turn began
		// (because we use this as a differential to calculate how much time the player took when
		// they end their turn)
		g.DatetimeTurnBegin = g.DatetimeTurnBegin.Add(time.Since(g.PauseTime))

		// Send everyone new clock values
		t.NotifyTime()

		// Restart the function that will check to see if the current player has run out of time
		// (since the existing function will return and do nothing if the game is paused)
		go g.CheckTimer(g.Turn, g.PauseCount, g.Players[g.ActivePlayerIndex])
	}

	t.NotifyPause()

	// Also send a chat message about it
	msg := s.Username() + " "
	if !g.Paused {
		msg += "un"
	}
	msg += "paused the game."
	chatServerSend(msg, "table"+strconv.Itoa(t.ID))
}
