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
		s.Warning("Game " + strconv.Itoa(gameID) + " does not exist.")
		return
	} else {
		g = v
	}

	// Validate that they are in the game
	i := g.GetPlayerIndex(s.UserID())
	if i == -1 {
		s.Warning("You are in not game " + strconv.Itoa(gameID) + ", so you cannot abandon it.")
		return
	}

	// Validate that it is not a shared replay
	if g.SharedReplay {
		s.Warning("You can not abandon a shared replay.")
		return
	}

	/*
		Abandon
	*/

	if !g.Running {
		// Just make them leave the game instead
		commandGameLeave(s, d)
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
}
