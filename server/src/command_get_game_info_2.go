package main

import (
	"strconv"
)

// commandGetGameInfo2 provides all of the actions that have happened thus far in the game
// It is sent when the user has joined a game and the UI has been initialized
//
// Example data:
// {
//   tableID: 5,
// }
func commandGetGameInfo2(s *Session, d *CommandData) {
	/*
		Validate
	*/

	// Validate that the table exists
	tableID := d.TableID
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
		s.Warning(ChatCommandNotStartedFail)
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
		for _, action := range g.Actions {
			scrubbedAction := CheckScrub(t, action, s.UserID())
			scrubbedActions = append(scrubbedActions, scrubbedAction)
		}
	} else {
		// The person requesting the game state is not an active player
		// (and not a spectator shadowing a player), so we do not need to hide any information
		scrubbedActions = g.Actions
	}

	// Send them all the actions in the game that have happened thus far
	type GameActionListMessage struct {
		TableID int           `json:"tableID"`
		List    []interface{} `json:"list"`
	}
	s.Emit("gameActionList", &GameActionListMessage{
		TableID: t.ID,
		List:    scrubbedActions,
	})

	// Send them the full list of all the cards in the deck if the game is already over
	if t.Replay {
		s.NotifyCardIdentities(t)
	}

	// If it is their turn, send a "yourTurn" message
	if !t.Replay && g.ActivePlayerIndex == i {
		s.NotifyYourTurn(t)
	}

	// Check if the game is still in progress
	if t.Replay {
		// Since the game is over, send them the notes from all the players & spectators
		s.NotifyNoteList(t, -1)
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
			// They are a player in an ongoing game
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
			// They are a spectator in an ongoing game
			sp := t.Spectators[j]
			s.NotifyNoteList(t, sp.ShadowPlayerIndex)
		}
	}

	if t.Visible {
		// Send them the number of spectators
		s.NotifySpectators(t)

		// Send them the chat history for this game
		chatSendPastFromTable(s, t)

		// Send them messages for people typing, if any
		for _, p := range t.Players {
			if p.Typing {
				s.NotifyChatTyping(p.Name, p.Typing)
			}
		}
		for _, sp := range t.Spectators {
			if sp.Typing {
				s.NotifyChatTyping(sp.Name, sp.Typing)
			}
		}
	}
}
