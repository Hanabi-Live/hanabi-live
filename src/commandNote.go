/*
	Sent when the user writes a note
	"data" example:
	{
		order: 3,
		note: 'b1, m1',
	}
*/

package main

import (
	"strconv"

	"github.com/microcosm-cc/bluemonday"
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
	j := g.GetSpectatorIndex(s.UserID())
	if i == -1 && j == -1 {
		s.Warning("You are in not game " + strconv.Itoa(gameID) + ", so you cannot send a note.")
		return
	}

	// Sanitize the message using the bluemonday library to stop
	// various attacks against other players
	policy := bluemonday.StrictPolicy()
	d.Note = policy.Sanitize(d.Note)

	/*
		Note
	*/

	if i > -1 {
		p := g.Players[i]

		// Update the array that contains all of their notes
		p.Notes[d.Order] = d.Note

	} else if j > -1 {
		sp := g.Spectators[j]

		// Update the array that contains all of their notes
		sp.Notes[d.Order] = d.Note
	}

	// Let all of the spectators know that there is a new note
	g.NotifySpectatorsNote(d.Order)
}
