/*
	Sent when the user clicks on the "Spectate" button in the lobby
	(the client will send a "hello" message after getting "gameStart")
	Sent on behalf of a user when they create a solo replay
	Sent on behalf of a user when they create a shared replay
	Sent on behalf of a user when they reconnect after having been in a shared replay

	"data" example:
	{
		gameID: 15103,
		player: "Zamiel", // Optional
		// If the player is specified, they will spectate from that player's perspective
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

	// Validate that they are not already spectating a game
	for _, g2 := range games {
		for _, sp := range g2.Spectators {
			if sp.ID == s.UserID() {
				if g2.ID == g.ID {
					s.Warning("You are already spectating this game.")
				} else {
					s.Warning("You are already spectating another game.")
				}
				return
			}
		}
	}

	// Validate the player name
	// (if provided, they want to spectate from a specific player's perspective)
	playerIndex := -1
	if d.Player != "" {
		if g.Replay {
			s.Warning("You cannot provide a player index to a replay.")
			return
		}

		for i, p := range g.Players {
			if p.Name == d.Player {
				playerIndex = i
				break
			}
		}
		if playerIndex == -1 {
			s.Warning("That is an invalid player name.")
			return
		}
	}

	/*
		Spectate / Join Solo Replay / Join Shared Replay
	*/

	if g.Replay {
		log.Info(g.GetName() + "User \"" + s.Username() + "\" joined.")
	} else {
		log.Info(g.GetName() + "User \"" + s.Username() + "\" spectated.")
	}

	// Add them to the spectators object
	sp := &Spectator{
		ID:          s.UserID(),
		Name:        s.Username(),
		Session:     s,
		Shadowing:   playerIndex != -1,
		PlayerIndex: playerIndex,
		Notes:       make([]string, len(g.Deck)),
	}
	g.Spectators = append(g.Spectators, sp)
	notifyAllTable(g)    // Update the spectator list for the row in the lobby
	g.NotifySpectators() // Update the in-game spectator list

	// Set their status
	s.Set("currentGame", g.ID)
	status := statusSpectating
	if g.Replay {
		if g.Visible {
			status = statusSharedReplay
		} else {
			status = statusReplay
		}
	}
	s.Set("status", status)
	notifyAllUser(s)

	// Send them a "gameStart" message
	s.NotifyGameStart()
}
