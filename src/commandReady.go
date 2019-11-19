/*
	Sent when the user has joined a game and the UI has been initialized
	"data" is empty
*/

package main

import (
	"strconv"
)

func commandReady(s *Session, d *CommandData) {
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
	g := t.Game

	// Validate that the game has started
	if !t.Running {
		s.Warning("The game for table " + strconv.Itoa(tableID) + " has not started yet.")
		return
	}

	// Validate that they are either a player or a spectator
	i := t.GetPlayerIndexFromID(s.UserID())
	j := t.GetSpectatorIndexFromID(s.UserID())
	if i == -1 && j == -1 {
		s.Warning("You are not a player or a spectator at table " + strconv.Itoa(tableID) + ", " +
			"so you cannot ready up for it.")
		return
	}

	/*
		Ready
	*/

	// Check to see if we need to remove some card information
	var scrubbedActions []interface{}
	if !t.Replay {
		for _, a := range g.Actions {
			drawAction, ok := a.(ActionDraw)
			if ok && drawAction.Type == "draw" {
				drawAction.Scrub(t, s.UserID())
				a = drawAction
			}
			scrubbedActions = append(scrubbedActions, a)
		}
	} else {
		// The person requesting the game state is not an active player
		// (and not a spectator shadowing a player), so we do not need to hide any information
		scrubbedActions = g.Actions
	}

	// Send a "notify" message for every action of the game
	s.Emit("notifyList", &scrubbedActions)

	// If it is their turn, send an "action" message
	if !t.Replay && g.ActivePlayer == i {
		s.NotifyAction()
	}

	// Check if the game is still in progress
	if t.Replay {
		// Since the game is over, send them the notes from all the players & spectators
		s.NotifyNoteList(t)
	} else {
		// Send them the current connection status of the players
		s.NotifyConnected(t)

		// Send them the current time for all player's clocks
		s.NotifyTime(t)

		// If this is the first turn, send them a sound so that they know the game started
		if g.Turn == 0 {
			s.NotifySound(t, i)
		}

		if i > -1 {
			// They are a player
			p := g.Players[i]

			// Send them a list of only their notes
			type NoteListPlayerMessage struct {
				Notes []string `json:"notes"`
			}
			s.Emit("noteListPlayer", &NoteListPlayerMessage{
				Notes: p.Notes,
			})

			// Set their "present" variable back to true,
			// which will turn their name from red to black
			t.Players[i].Present = true
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

		// Send them the chat history for this game
		chatSendPastFromTable(s, t)
	}

	if t.Replay && t.Visible {
		// Enable the replay controls for the leader of the review
		s.NotifyReplayLeader(t, false)

		// Send them to the current turn that everyone else is at
		type ReplayTurnMessage struct {
			Turn int `json:"turn"`
		}
		s.Emit("replayTurn", &ReplayTurnMessage{
			Turn: g.Turn,
		})
	}
}
