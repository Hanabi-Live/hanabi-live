/*
	Sent when the user clicks the "X" button next to the table in the lobby
	"data" example:
	{
		gameID: 594,
	}
*/

package main

import (
	"strconv"
)

func commandGameAbandon(s *Session, d *CommandData) {
	/*
		Validate
	*/

	// Validate that the game exists
	gameID := d.ID
	var g *Game
	if v, ok := games[gameID]; !ok {
		s.NotifyError("Game " + strconv.Itoa(gameID) + " does not exist.")
		return
	} else {
		g = v
	}

	// Validate that the game has started
	if !g.Running {
		s.NotifyError("Game " + strconv.Itoa(gameID) + " has not started yet.")
		return
	}

	/*
		Abandon
	*/

	// End the game and write it to the database
	text := s.Username() + " terminated the game!"
	g.Actions = append(g.Actions, Action{
		Text: text,
	})
	g.NotifyAction()
	g.End()

	// Boot the people in the game back to the lobby screen
	g.NotifyBoot(s.Username())
}
