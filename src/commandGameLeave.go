/*
	Sent when the user clicks on the "Leave Game" button in the lobby
	"data" is empty
*/

package main

func commandGameLeave(s *Session, d *CommandData) {
	/*
		Validation
	*/

	// Validate that the game exists
	var g *Game
	if v, ok := games[d.ID]; !ok {
		return
	} else {
		g = v
	}

	// Validate that the game has not started
	if g.Running {
		return
	}

	// Validate that they are in the game
	i := g.GetIndex(s.Username())
	if i == -1 {
		return
	}

	/*
		Leave
	*/

	log.Info("User \"" + s.Username() + "\" left game: " + g.GetName())

	// Remove the player
	g.Players = append(g.Players[:i], g.Players[i+1:]...)
	notifyAllTable(g)
	g.NotifyPlayerChange()

	// Set their status
	s.Set("currentGame", -1)
	s.Set("status", "Lobby")
	notifyAllUser(s)

	// Make the client switch screens to show the base lobby
	s.Emit("left", nil)

	// Force everyone else to leave if it was the owner that left
	if s.UserID() == g.Owner {
		for _, p := range g.Players {
			commandGameLeave(p.Session, d)
		}
		return
	}

	if len(g.Players) == 0 {
		// Delete the game if this is the last person to leave
		delete(games, d.ID)
		notifyAllTableGone(g)
	}
}
