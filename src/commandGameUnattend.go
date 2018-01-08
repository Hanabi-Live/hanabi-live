/*
	Sent when the user clicks on the "Lobby" button while they are in the middle of a game
	"data" is empty
*/

package main

import "strconv"

func commandGameUnattend(s *Session, d *CommandData) {
	// Set their status
	oldStatus := s.Status()
	s.Set("status", "Lobby")
	notifyAllUser(s)

	// Check to see if they are in a (solo) replay
	if oldStatus == "Replay" {
		s.Set("currentGame", -1)
		return
	}

	// Validate that the game exists
	gameID := s.CurrentGame()
	var g *Game
	if v, ok := games[gameID]; !ok {
		// Since the player could be in a solo replay, it is normal behavior for the game to not exist
		s.Set("currentGame", -1)
		return
	} else {
		g = v
	}

	// Check to see if they are a spectator
	if oldStatus == "Spectating" || oldStatus == "Shared Replay" {
		if _, ok := g.Spectators[s.UserID()]; !ok {
			log.Error("User \"" + s.Username() + "\" tried to unattend game " + strconv.Itoa(gameID) + ", but they were not in the spectators list.")
			return
		}

		// We only want to reset this for players who are not in the actual game
		s.Set("currentGame", -1)

		delete(g.Spectators, s.UserID())
		g.NotifyPlayerChange()
		g.NotifySpectators()

		if g.SharedReplay {
			if len(g.Spectators) == 0 {
				// This was the last person to leave the shared replay, so delete it
				log.Info("Ended shared replay " + strconv.Itoa(gameID) + " because everyone left.")
				delete(games, gameID)

				// Notify everyone that the table was deleted
				notifyAllTableGone(g)
			} else {
				// Since the number of spectators is the number of players for shared replays,
				// we need to notify everyone that this player left
				notifyAllTable(g)
			}
		}

		return
	}

	// Set their "present" variable to false, which will turn their name red
	// (or set them to "AWAY" if the game has not started yet)
	i := g.GetIndex(s.UserID())
	if i == -1 {
		s.Error("You are not in game " + strconv.Itoa(gameID) + ", so you cannot unattend it.")
		return
	}
	p := g.Players[i]
	p.Present = false

	if g.Running {
		g.NotifyConnected()
	} else {
		g.NotifyPlayerChange()
	}

	// They got sent a "tableGone" message earlier (if the game started),
	// so send them a new table message
	s.NotifyTable(g)
}
