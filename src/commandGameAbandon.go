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
		s.Error("Game " + strconv.Itoa(gameID) + " does not exist.")
		return
	} else {
		g = v
	}

	// Validate that they are in the game
	i := g.GetIndex(s.UserID())
	if i == -1 {
		s.Error("You are in not game " + strconv.Itoa(gameID) + ", so you cannot abandon it.")
		return
	}

	// Validate that they are the owner of the game
	if g.Owner != s.UserID() {
		// Just make them leave the game instead
		commandGameLeave(s, d)
		return
	}

	/*
		Abandon
	*/

	if !g.Running {
		// Set their status
		s.Set("currentGame", -1)
		s.Set("status", "Lobby")
		notifyAllUser(s)

		// Delete the game and don't write it to the database
		delete(games, gameID)
		notifyAllTableGone(g)
		return
	}

	// End the game and write it to the database
	text := s.Username() + " terminated the game!"
	g.Actions = append(g.Actions, Action{
		Text: text,
	})
	g.NotifyAction()
	g.EndCondition = 4
	g.Score = 0
	g.End()

	// Boot the people in the game back to the lobby screen
	g.NotifyBoot(s.Username())
}
