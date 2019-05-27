/*
	Sends game actions to a user once their UI has been initialized.
	"data" is empty.
*/

package main

import (
	"strconv"
)

func commandActions(s *Session, d *CommandData) {
	/*
		Validate
	*/

	// Validate that the table exists
	tableID := s.CurrentTable()
	var t *Table
	if v, ok := tables[tableID]; !ok {
		s.Warning("Table " + strconv.Itoa(tableID) + " does not exist.")
		return
	} else {
		t = v
	}

	// Validate that the game has started
	if !t.Game.Running {
		s.Warning("Table " + strconv.Itoa(tableID) + " has not started yet.")
		return
	}

	// Validate that they are either a player or a spectator
	i := t.GameSpec.GetPlayerIndex(s.UserID())
	j := t.GetSpectatorIndex(s.UserID())
	if i == -1 && j == -1 {
		s.Warning("You are not a player or a spectator of table " + strconv.Itoa(tableID) + ", " +
			"so you cannot ready up for it.")
		return
	}

	/*
		Ready
	*/

	// Check to see if we need to remove some card information
	var scrubbedActions []interface{}
	if !t.Game.Replay && (i > -1 || (j > -1 && t.Spectators[j].Shadowing)) {
		// The person requesting the game state is one of the active players
		// (or a spectator shadowing one of the active players),
		// so we need to hide some information
		var p *Player
		if i > -1 {
			p = t.GameSpec.Players[i]
		} else {
			p = t.GameSpec.Players[t.Spectators[j].PlayerIndex]
		}

		for _, a := range t.Game.Actions {
			drawAction, ok := a.(ActionDraw)
			if ok && drawAction.Type == "draw" {
				drawAction.Scrub(t, p)
				a = drawAction
			}
			scrubbedActions = append(scrubbedActions, a)
		}
	} else {
		// The person requesting the game state is not an active player,
		// so we don't need to hide any information
		scrubbedActions = t.Game.Actions
	}

	// Send a "notify" message for every action of the game
	s.Emit("actions", &scrubbedActions)

	// If it is their turn, send an "action" message
	if !t.Game.Replay && t.Game.ActivePlayer == i {
		s.NotifyAllowedActions(t)
	}

	// Send a message which triggers the client to draw the UI
        // This only matters if in replay
	s.Emit("initUIIfInReplay", nil)

	// Check if the game is still in progress
	if t.Game.Replay {
		// Since the game is over, send them the notes from all the players & spectators
		s.NotifyNoteList(t)
	} else {
		// Send them the current connection status of the players
		s.NotifyConnected(t)

		// Send them the current time for all player's clocks
		s.NotifyTime(t)

		// If this is the first turn, send them a sound so that they know the game started
		if t.Game.Turn == 0 {
			s.NotifySound(t, i)
		}

		if i > -1 {
			// They are a player
			p := t.GameSpec.Players[i]

			// Send them a list of only their notes
			type NoteListPlayerMessage struct {
				Notes []string `json:"notes"`
			}
			s.Emit("noteListPlayer", &NoteListPlayerMessage{
				Notes: p.Notes,
			})

			// Set their "present" variable back to true,
			// which will turn their name from red to black
			p.Present = true
			t.NotifyConnected()
		} else if j > -1 {
			// They are a spectator
			// Send them the notes from all the players & spectators
			s.NotifyNoteList(t)
		}
	}

	if t.Visible {
		// Send them the number of spectators
		s.NotifySpectators(t)

		// Send them the chat history for this table
		chatSendPastFromTable(s, t)
	}

	if t.Game.Replay && t.Visible {
		// Enable the replay controls for the leader of the review
		s.NotifyReplayLeader(t)

		// Send them to the current turn that everyone else is at
		type ReplayTurnMessage struct {
			Turn int `json:"turn"`
		}
		s.Emit("replayTurn", &ReplayTurnMessage{
			Turn: t.Game.Turn,
		})
	}
}
