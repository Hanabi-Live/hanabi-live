/*
	Sent when the user clicks on the "Lobby" button while they are in the middle of a game
	"data" is empty
*/

package main

import (
	"strconv"
)

func commandGameUnattend(s *Session, d *CommandData) {
	// Set their status
	s.Set("status", statusLobby)
	gameID := s.CurrentGame()
	s.Set("currentGame", -1)
	notifyAllUser(s)

	// Validate that the game exists
	if gameID == -1 {
		// The user may be returning from a replay that was ended due to idleness,
		// or perhaps they lagged and sent two gameUnattend messages,
		// with this one being the second one
		log.Info("User \"" + s.Username() + "\" tried to unattend, " +
			"but their game ID was set to -1.")
		return
	}
	var g *Game
	if v, ok := games[gameID]; !ok {
		s.Error("Game " + strconv.Itoa(gameID) + " does not exist, so you cannot unattend it.")
		return
	} else {
		g = v
	}

	// Validate that they are either playing or spectating the game
	i := g.GetPlayerIndex(s.UserID())
	j := g.GetSpectatorIndex(s.UserID())
	if i == -1 && j == -1 {
		s.Warning("You are not playing or spectating game " + strconv.Itoa(g.ID) + ".")
		return
	}
	if g.Replay && j == -1 {
		s.Warning("You are not spectating replay " + strconv.Itoa(g.ID) + ".")
		return
	}

	if !g.Replay && i != -1 {
		commandGameUnattendPlayer(s, g, i)
	} else {
		commandGameUnattendSpectator(g, j)
	}
}

func commandGameUnattendPlayer(s *Session, g *Game, i int) {
	// Set their "present" variable to false, which will turn their name red
	// (or set them to "AWAY" if the game has not started yet)
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

func commandGameUnattendSpectator(g *Game, j int) {
	// If this is an ongoing game, create a list of any notes that they wrote
	cardOrderList := make([]int, 0)
	if !g.Replay {
		sp := g.Spectators[j]
		for i, note := range sp.Notes {
			if note != "" {
				cardOrderList = append(cardOrderList, i)
			}
		}
	}

	// Remove them from the spectators slice
	g.Spectators = append(g.Spectators[:j], g.Spectators[j+1:]...)
	notifyAllTable(g)    // Update the spectator list for the row in the lobby
	g.NotifySpectators() // Update the in-game spectator list

	if g.Replay {
		if len(g.Spectators) == 0 {
			// This was the last person to leave the replay, so delete it
			log.Info("Ended replay #" + strconv.Itoa(g.ID) + " because everyone left.")
			delete(games, g.ID)

			// Notify everyone that the table was deleted
			notifyAllTableGone(g)
		}
	} else if len(cardOrderList) > 0 {
		// Since this is a spectator leaving an ongoing game, all of their notes will be deleted
		// Send the other spectators a message about the new list of notes, if any
		for _, order := range cardOrderList {
			g.NotifySpectatorsNote(order)
		}
	}
}
