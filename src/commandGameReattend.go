/*
	Sent when the user clicks on the "Resume" button in the lobby
	"data" example:
	{
		gameID: 31,
	}
*/

package main

import (
	"strconv"
)

func commandGameReattend(s *Session, d *CommandData) {
	/*
		Validation
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
		s.Error("You are not in game " + strconv.Itoa(gameID) + ", so you cannot leave it.")
		return
	}

	/*
		Reattend
	*/

	// Set their "present" variable back to true, which will turn their name
	// from red to black (or remove the "AWAY" if the game has not started yet)
	p := g.Players[i]
	p.Present = true
	if g.Running {
		g.NotifyConnected()
	} else {
		g.NotifyPlayerChange()
	}

	// Set their status
	if g.Running {
		s.Set("status", "Playing")
	} else {
		s.Set("status", "Pre-Game")
	}
	notifyAllUser(s)

	// Let the client know they successfully joined the table
	type JoinedMessage struct {
		ID int `json:"gameID"`
	}
	s.Emit("joined", &JoinedMessage{
		ID: gameID,
	})

	// Make the client switch screens to show the game UI
	if g.Running {
		s.NotifyGameStart()
	}
}
