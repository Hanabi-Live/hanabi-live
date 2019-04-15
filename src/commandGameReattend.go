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
		s.Warning("Game " + strconv.Itoa(gameID) + " does not exist.")
		return
	} else {
		g = v
	}

	// Validate that they are in the game
	i := g.GetPlayerIndex(s.UserID())
	if i == -1 {
		s.Warning("You are not in game " + strconv.Itoa(gameID) + ", so you cannot reattend it.")
		return
	}

	/*
		Reattend
	*/

	log.Info(g.GetName() + "User \"" + s.Username() + "\" reattended.")

	// Set their "present" variable back to true, which will remove the "AWAY" if the game has not started yet
	// (if the game is running, this is handled in the "commandReady()" function)
	p := g.Players[i]
	if !g.Running {
		p.Present = true
		g.NotifyPlayerChange()
	}

	// Set their status
	s.Set("currentGame", gameID)
	if g.Running {
		s.Set("status", statusPlaying)
	} else {
		s.Set("status", statusPregame)
	}
	notifyAllUser(s)

	// Let the client know they successfully joined the table
	type JoinedMessage struct {
		ID int `json:"gameID"`
	}
	s.Emit("joined", &JoinedMessage{
		ID: gameID,
	})

	// Send them the chat history for this game
	// (if the game is running, this is handled in the "commandReady()" function)
	if !g.Running {
		chatSendPastFromGame(s, g)
	}

	if g.Running {
		// Make the client switch screens to show the game UI
		s.NotifyGameStart()
	} else {
		// Send the table owner whether or not the "Start Game" button should be grayed out
		g.NotifyTableReady()
	}
}
