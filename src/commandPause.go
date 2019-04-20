/*
	Sent when the user pauses or unpauses the game
	"data" example:
	{
		value: 'pause', // Can also be 'unpause', 'pause-queue', 'pause-unqueue'
		// ('pause-queue' will automatically pause the game when it gets to their turn)
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

	// Validate that the game exists
	gameID := s.CurrentGame()
	var g *Game
	if v, ok := games[gameID]; !ok {
		s.Warning("Game " + strconv.Itoa(gameID) + " does not exist.")
		return
	} else {
		g = v
	}

	// Validate that the game has started
	if !g.Running {
		s.Warning("Game " + strconv.Itoa(gameID) + " has not started yet.")
		return
	}

	// Validate that they are in the game
	i := g.GetPlayerIndex(s.UserID())
	if i == -1 {
		s.Warning("You are in not game " + strconv.Itoa(gameID) + ", so you cannot send a note.")
		return
	}
	p := g.Players[i]

	// Validate that it is a timed game
	if !g.Options.Timed {
		s.Warning("This is not a timed game, so you cannot pause / unpause.")
		return
	}

	// If a player requests a queued pause on their turn, turn it into a normal pause
	if d.Value == "pause-queue" && g.ActivePlayer == i {
		d.Value = "pause"
	}

	// Validate the value
	if d.Value == "pause" {
		if g.Paused {
			s.Warning("The game is already paused.")
			return
		}
	} else if d.Value == "unpause" {
		if !g.Paused {
			s.Warning("The game is not paused, so you cannot unpause.")
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
		g.Paused = true
		g.PauseTime = time.Now()
		g.PauseCount++
		g.PausePlayer = i
	} else if d.Value == "unpause" {
		g.Paused = false

		// Add the time elapsed during the pause to the time recorded when the turn began
		// (because we use this as a differential to calculate how much time the player took when
		// they end their turn)
		g.TurnBeginTime = g.TurnBeginTime.Add(time.Since(g.PauseTime))

		// Send everyone new clock values
		g.NotifyTime()

		// Restart the function that will check to see if the current player has run out of time
		// (since the existing function will return and do nothing if the game is paused)
		go g.CheckTimer(g.Turn, g.PauseCount, g.Players[g.ActivePlayer])
	}

	g.NotifyPause()
}
