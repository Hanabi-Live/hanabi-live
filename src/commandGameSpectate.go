/*
	Sent when the user clicks on the "Spectate" button in the lobby
	(the client will send a "hello" message after getting "gameStart")

	"data" example:
	{
		gameID: 15103,
	}
*/

package main

import "strconv"

func commandGameSpectate(s *Session, d *CommandData) {
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

	// Validate that the player is not joined to another game
	if s.CurrentGame() != -1 {
		s.Error("You cannot be in more than one game at a time. (You are already in game " + strconv.Itoa(s.CurrentGame()) + ".)")
		return
	}

	// Validate that the game has started
	if !g.Running {
		s.Error("Game " + strconv.Itoa(gameID) + " has not started yet.")
		return
	}

	// The logic for joining a shared replay is in a separate function for organizational purposes
	// (users should see a "Spectate" button for shared replays)
	if g.SharedReplay {
		joinSharedReplay(s, g)
		return
	}

	/*
		Spectate
	*/

	log.Info(g.GetName() + "User \"" + s.Username() + "\" spectated.")

	// Start the idle timeout
	go g.CheckIdle()

	// Add them to the spectators object
	g.Spectators[s.UserID()] = s
	g.NotifyPlayerChange()
	g.NotifySpectators()

	// Set their status
	s.Set("currentGame", gameID)
	s.Set("status", "Spectating")
	notifyAllUser(s)

	// Send them a "gameStart" message
	s.NotifyGameStart()
}

func joinSharedReplay(s *Session, g *Game) {
	log.Info(g.GetName() + "User \"" + s.Username() + "\" joined.")

	// Start the idle timeout
	go g.CheckIdle()

	// Add them to the spectators object
	g.Spectators[s.UserID()] = s
	notifyAllTable(g)
	g.NotifyPlayerChange()
	g.NotifySpectators()

	// Set their status
	s.Set("currentGame", g.ID)
	s.Set("status", "Shared Replay")
	notifyAllUser(s)

	// Send them a "gameStart" message
	s.NotifyGameStart()
}
