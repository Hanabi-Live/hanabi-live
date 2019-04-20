/*
	Sent when the user has joined a game and the UI has been initialized
	"data" is empty
*/

package main

import (
	"strconv"

	"github.com/Zamiell/hanabi-live/src/models"
)

func commandReady(s *Session, d *CommandData) {
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

	/*
		Ready
	*/

	i := g.GetPlayerIndex(s.UserID())
	j := g.GetSpectatorIndex(s.UserID())

	notes := make([]models.PlayerNote, 0)
	for _, p := range g.Players {
		note := models.PlayerNote{
			ID:    p.ID,
			Name:  p.Name,
			Notes: p.Notes,
		}
		notes = append(notes, note)
	}

	// Check to see if we need to remove some card information
	var scrubbedActions []interface{}
	if !g.Replay && (i > -1 || (j > -1 && g.Spectators[j].Shadowing)) {
		// The person requesting the game state is one of the active players
		// (or a spectator shadowing one of the active players),
		// so we need to hide some information
		var p *Player
		if i > -1 {
			p = g.Players[i]
		} else {
			p = g.Players[g.Spectators[j].PlayerIndex]
		}

		for _, a := range g.Actions {
			drawAction, ok := a.(ActionDraw)
			if ok && drawAction.Type == "draw" {
				drawAction.Scrub(g, p)
				a = drawAction
			}
			scrubbedActions = append(scrubbedActions, a)
		}
	} else {
		// The person requesting the game state is not an active player,
		// so we don't need to hide any information
		scrubbedActions = g.Actions
	}

	// Send a "notify" message for every action of the game
	s.Emit("notifyList", &scrubbedActions)

	// If it is their turn, send an "action" message
	if !g.Replay && g.ActivePlayer == i {
		s.NotifyAction(g)
	}

	// Send an "advanced" message
	// (if this is not sent during a replay, the UI will look uninitialized)
	s.Emit("advanced", nil)

	// Check if the game is still in progress
	if g.Replay {
		// Since the game is over, send them the notes from everyone in the game
		s.NotifyAllNotes(notes)
	} else {
		// Send them the current connection status of the players
		s.NotifyConnected(g)

		// Send them the current time for all player's clocks
		s.NotifyTime(g)

		// If this is the first turn, send them a sound so that they know the game started
		if g.Turn == 0 {
			s.NotifySound(g, i)
		}

		if i == -1 {
			// They are a spectator, so send them the notes from all players
			s.NotifyAllNotes(notes)
		} else {
			// Send them a list of only their notes
			type NotesMessage struct {
				Notes []string `json:"notes"`
			}
			s.Emit("notes", &NotesMessage{
				Notes: notes[i].Notes,
			})

			// Set their "present" variable back to true,
			// which will turn their name from red to black
			p := g.Players[i]
			p.Present = true
			g.NotifyConnected()
		}
	}

	if g.Visible {
		// Send them the number of spectators
		s.NotifySpectators(g)

		// Send them the chat history for this game
		chatSendPastFromGame(s, g)
	}

	if g.Replay && g.Visible {
		// Enable the replay controls for the leader of the review
		s.NotifyReplayLeader(g)

		// Send them to the current turn that everyone else is at
		type ReplayTurnMessage struct {
			Turn int `json:"turn"`
		}
		s.Emit("replayTurn", &ReplayTurnMessage{
			Turn: g.Turn,
		})
	}
}
