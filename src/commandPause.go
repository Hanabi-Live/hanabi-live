/*
	Sent when the user pauses or unpauses the game
	"data" example:
	{
		value: 'pause', // Can also be 'unpause' or 'pause-queue'
		// ('pause-queue' will automatically pause the game when it gets to their turn,
		// after a short delay)
	}
*/

package main

import (
	"strconv"
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

	// Validate the value
	if d.Value == "pause" || d.Value == "pause-queue" {
		if g.Paused {
			s.Warning("The game is already paused.")
			return
		}

		if d.Value == "pause-queue" {
			if g.ActivePlayer == i {
				// A queued pause when
				d.Value = "pause"
			} else if p.RequestedPause {
				s.Warning("You have already requested a pause when it gets to your turn.")
				return
			}
		}

	} else if d.Value == "unpause" {
		if !g.Paused {
			s.Warning("The game is not paused, so you cannot unpause.")
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

	if d.Value == "pause" {
		g.Paused = true
	} else if d.Value == "unpause" {
		g.Paused = false
	}

	g.NotifyPause()
}
