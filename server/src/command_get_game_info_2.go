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
	t, exists := getTableAndLock(s, d.TableID, !d.NoLock)
	if !exists {
		return
	}
	if !d.NoLock {
		defer t.Mutex.Unlock()
	}

	// Validate that the game has started
	if !t.Running {
		s.Warning(NotStartedFail)
		return
	}

	// Validate that they are either a player or a spectator
	playerIndex := t.GetPlayerIndexFromID(s.UserID)
	spectatorIndex := t.GetSpectatorIndexFromID(s.UserID)
	if playerIndex == -1 && spectatorIndex == -1 {
		s.Warning("You are not a player or a spectator at table " +
			strconv.FormatUint(t.ID, 10) + ", so you cannot be ready for it.")
		return
	}

	getGameInfo2(s, t, playerIndex, spectatorIndex)
}

func getGameInfo2(s *Session, t *Table, playerIndex int, spectatorIndex int) {
	// Local variables
	g := t.Game

	// Check to see if we need to remove some card information
	scrubbedActions := make([]interface{}, 0)
	if !t.Replay {
		for _, action := range g.Actions {
			scrubbedAction := CheckScrub(t, action, s.UserID)
			scrubbedActions = append(scrubbedActions, scrubbedAction)
		}
	} else {
		// The person requesting the game state is not an active player
		// (and not a spectator shadowing a player), so we do not need to hide any information
		scrubbedActions = g.Actions
	}

	// Send them all the actions in the game that have happened thus far
	type GameActionListMessage struct {
		TableID uint64        `json:"tableID"`
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

	// Check if the game is still in progress
	if t.Replay {
		// Since the game is over, send them the notes from all the players & spectators
		s.NotifyNoteList(t, -1)
	} else {
		// Send them the current connection status of the players
		s.NotifyConnected(t)

		// Send them the current time for all player's clocks
		s.NotifyTime(t)

		if playerIndex > -1 {
			// They are a player in an ongoing game
			p := g.Players[playerIndex]

			// Send them a list of only their notes
			type NoteListPlayerMessage struct {
				TableID uint64   `json:"tableID"`
				Notes   []string `json:"notes"`
			}
			s.Emit("noteListPlayer", &NoteListPlayerMessage{
				TableID: t.ID,
				Notes:   p.Notes,
			})
		} else if spectatorIndex > -1 {
			// They are a spectator in an ongoing game
			sp := t.Spectators[spectatorIndex]
			s.NotifyNoteList(t, sp.ShadowingPlayerIndex)
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
				s.NotifyChatTyping(t, p.Name, p.Typing)
			}
		}
		for _, sp := range t.Spectators {
			if sp.Typing {
				s.NotifyChatTyping(t, sp.Name, sp.Typing)
			}
		}
	}

	if g.Hypothetical {
		type HypotheticalMessage struct {
			DrawnCardsShown bool     `json:"drawnCardsShown"`
			Actions         []string `json:"actions"`
		}
		s.Emit("hypothetical", &HypotheticalMessage{
			DrawnCardsShown: g.HypoDrawnCardsShown,
			Actions:         g.HypoActions,
		})
	}
}
