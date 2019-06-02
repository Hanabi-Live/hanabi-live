/*
	Sent when the user opens the in-game chat
	"data" is empty
*/

package main

import (
	"strconv"
)

func commandChatRead(s *Session, d *CommandData) {
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

	// Validate that they are in the game or are a spectator
	if g.GetPlayerIndex(s.UserID()) == -1 && g.GetSpectatorIndex(s.UserID()) == -1 {
		s.Warning("You are not playing or spectating game " + strconv.Itoa(gameID) + ", so you cannot acknowledge its chat.")
		return
	}

	/*
		Mark that they have read all of the in-game chat
	*/

	g.ChatRead[s.UserID()] = len(g.Chat)
}
