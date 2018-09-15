/*
	Sent when the user clicks on the "Leave Game" button in the lobby
	"data" is empty
*/

package main

import "strconv"

func commandGameLeave(s *Session, d *CommandData) {
	/*
		Validation
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

	// Validate that the game has not started
	if g.Running {
		s.Warning("That game has already started, so you cannot leave it.")
		return
	}

	// Validate that they are in the game
	i := g.GetPlayerIndex(s.UserID())
	if i == -1 {
		s.Warning("You are not in game " + strconv.Itoa(gameID) + ", so you cannot leave it.")
		return
	}

	/*
		Leave
	*/

	log.Info(g.GetName() + "User \"" + s.Username() + "\" left. (There are now " + strconv.Itoa(len(g.Players)-1) + " players.)")

	// Start the idle timeout
	go g.CheckIdle()

	// Remove the player
	g.Players = append(g.Players[:i], g.Players[i+1:]...)
	notifyAllTable(g)
	g.NotifyPlayerChange()

	// Fix the indexes for the remaining players
	for j, p := range g.Players {
		p.Index = j
	}

	// Set their status
	s.Set("currentGame", -1)
	s.Set("status", "Lobby")
	notifyAllUser(s)

	// Make the client switch screens to show the base lobby
	s.Emit("left", nil)

	// Force everyone else to leave if it was the owner that left
	if s.UserID() == g.Owner && len(g.Players) > 0 {
		for _, p := range g.Players {
			p.Session.Set("currentGame", g.ID)
			commandGameLeave(p.Session, d)
		}
		return
	}

	if len(g.Players) == 0 {
		// Delete the game if this is the last person to leave
		delete(games, gameID)
		notifyAllTableGone(g)
		return
	}

	// Send the table owner whether or not the "Start Game" button should be greyed out
	g.NotifyTableReady()
}
