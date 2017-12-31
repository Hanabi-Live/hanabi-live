/*
	Sent when the user has joined a game and the UI has been initialized
	"data" is empty
*/

package main

import (
	"encoding/json"
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
	if s.Status() != "Replay" {
		if v, ok := games[gameID]; !ok {
			s.NotifyError("Game " + strconv.Itoa(gameID) + " does not exist.")
			return
		} else {
			g = v
		}
	}

	/*
		Ready
	*/

	i := g.GetIndex(s.UserID())

	var actions []*Action
	if s.Status() == "Replay" || s.Status() == "Shared Replay" {
		actionStrings := make([]string, 0)
		if v, err := db.GameActions.GetAll(gameID); err != nil {
			log.Error("Failed to get the actions from the database for game "+strconv.Itoa(gameID)+":", err)
			s.NotifyError("Failed to initialize the game. Please contact an administrator.")
			return
		} else {
			actionStrings = v
		}

		for _, actionString := range actionStrings {
			// Convert it from JSON
			var action Action
			if err := json.Unmarshal([]byte(actionString), &action); err != nil {
				log.Error("Failed to unmarshal an action:", err)
				s.NotifyError("Failed to initialize the game. Please contact an administrator.")
				return
			}
			actions = append(actions, &action)
		}
	} else {
		actions = g.Actions
	}

	notes := make([]models.PlayerNote, 0)
	if s.Status() == "Replay" || s.Status() == "Shared Replay" {
		if v, err := db.Games.GetNotes(gameID); err != nil {
			log.Error("Failed to get the notes from the database for game "+strconv.Itoa(gameID)+":", err)
			s.NotifyError("Failed to initialize the game. Please contact an administrator.")
			return
		} else {
			notes = v
		}
	} else {
		for _, p := range g.Players {
			note := models.PlayerNote{
				ID:    p.ID,
				Name:  p.Name,
				Notes: p.Notes,
			}
			notes = append(notes, note)
		}
	}

	// Send a "notify" or "message" message for every game action of the deal
	for _, a := range actions {
		s.NotifyGameAction(*a, g)
	}

	// If it is their turn, send an "action" message
	if s.Status() != "Replay" && s.Status() != "Shared Replay" && g.ActivePlayer == i {
		s.NotifyAction(g)
	}

	// Send an "advanced" message
	// (if this is not sent during a replay, the UI will look uninitialized)
	s.Emit("advanced", nil)

	// Check if the game is still in progress
	if s.Status() == "Replay" || s.Status() == "Shared Replay" {
		// Since the game is over, send them the notes from everyone in the game
		s.NotifyAllNotes(notes)
	} else {
		// Send them the current time for all player's clocks
		s.NotifyClock(g)

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
		}
	}

	// Send them the number of spectators
	if s.Status() != "Replay" {
		s.NotifySpectators(g)
	}

	if s.Status() == "Shared Replay" {
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
