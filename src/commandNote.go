/*
	Sent when the user writes a note
	"data" example:
	{
		order: 3,
		note: 'b1,m1',
	}
*/

package main

import (
	"strconv"
)

func commandNote(s *Session, d *CommandData) {
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

	/*
		Note
	*/

	// Start the idle timeout
	go g.CheckIdle()

	// Update the array that contains all of their notes
	p.Notes[d.Order] = d.Note

	// Let all of the spectators know that there is a new note
	g.NotifySpectatorsNote(d.Order)
}
