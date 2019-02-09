/*
	Sent when the user clicks on the "Spectate" button in the lobby
	(the client will send a "hello" message after getting "gameStart")

	"data" example:
	{
		gameID: 15103,
	}
*/

package main

import (
	"strconv"
)

func commandGameSpectate(s *Session, d *CommandData) {
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

	// Validate that the game has started
	if !g.Running {
		s.Warning("Game " + strconv.Itoa(gameID) + " has not started yet.")
		return
	}

	// Validate that they are not already in the spectators object
	for _, sp := range g.Spectators {
		if sp.ID == s.UserID() {
			s.Warning("You are already spectating game " + strconv.Itoa(gameID) + ".")
			return
		}
	}

	/*
		Spectate / Join Shared Replay
	*/

	if !g.SharedReplay {
		log.Info(g.GetName() + "User \"" + s.Username() + "\" spectated.")
	} else {
		log.Info(g.GetName() + "User \"" + s.Username() + "\" joined.")
	}

	// Add them to the spectators object
	sp := &Spectator{
		ID:    s.UserID(),
		Name:  s.Username(),
		Index: len(g.Spectators),
		// We have not added this player to the slice yet, so this should be 0 initially
		Session: s,
	}
	g.Spectators = append(g.Spectators, sp)
	notifyAllTable(g)    // Update the spectator list for the row in the lobby
	g.NotifySpectators() // Update the in-game spectator list

	// Set their status
	s.Set("currentGame", g.ID)
	status := statusSpectating
	if g.SharedReplay {
		status = statusSharedReplay
	}
	s.Set("status", status)
	notifyAllUser(s)

	// Send them a "gameStart" message
	s.NotifyGameStart()
}
