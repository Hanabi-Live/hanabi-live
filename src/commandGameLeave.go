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
		s.NotifyError("Game " + strconv.Itoa(gameID) + " does not exist.")
		return
	} else {
		g = v
	}

	// Validate that the game has not started
	if g.Running {
		s.NotifyError("That game has already started, so you cannot leave it.")
		return
	}

	// Validate that they are in the game
	i := g.GetIndex(s.UserID())
	if i == -1 {
		s.NotifyError("You are not in this game, so you cannot leave it.")
		return
	}

	/*
		Leave
	*/

	// Remove the player
	g.Players = append(g.Players[:i], g.Players[i+1:]...)
	notifyAllTable(g)
	g.NotifyPlayerChange()

	log.Info(g.GetName() + "User \"" + s.Username() + "\" left. (" + strconv.Itoa(len(g.Players)) + " players remaining.)")

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
			commandGameLeave(p.Session, d)
		}
		return
	}

	if len(g.Players) == 0 {
		// Delete the game if this is the last person to leave
		delete(games, gameID)
		notifyAllTableGone(g)
	}
}
