/*
	Sent when the user performs an action in a shared replay
	"data" example:
	{
		type: 0, // Types are listed in the "constants.go" file
		value: 10,
		name: 'Zamiel',
	}
*/

package main

import (
	"encoding/json"
	"math"
	"strconv"
)

func commandReplayAction(s *Session, d *CommandData) {
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

	// Validate that this is a shared replay
	if !g.Replay || !g.Visible {
		s.Warning("Game " + strconv.Itoa(gameID) + " is not a shared replay, so you cannot send a shared replay action.")
		return
	}

	// Validate that this person is leading the review
	if s.UserID() != g.Owner {
		s.Warning("You cannot send a shared replay action unless you are the leader.")
		return
	}

	/*
		Replay action
	*/

	// Start the idle timeout
	go g.CheckIdle()

	// Send the message to everyone else
	if d.Type == replayActionTypeTurn {
		// A turn change
		g.Turn = d.Turn
		for _, sp := range g.Spectators {
			type ReplayTurnMessage struct {
				Turn int `json:"turn"`
			}
			sp.Session.Emit("replayTurn", &ReplayTurnMessage{
				Turn: d.Turn,
			})
		}

		// Update the progress
		progress := float64(g.Turn) / float64(g.EndTurn) * 100 // In percent
		g.Progress = int(math.Round(progress))                 // Round it to the nearest integer
		if g.Progress > 100 {
			// It is possible to go past the last turn,
			// since an extra turn is appended to the end of every game with timing information
			g.Progress = 100
		} else if g.Progress < 0 {
			// This can happen if the maximum turn is 0
			g.Progress = 0
		}

		// Send every user connected an update about this table
		// (this is sort of wasteful but is necessary for users to see the progress of the replay from the lobby)
		notifyAllTable(g)
	} else if d.Type == replayActionTypeArrow {
		// A card arrow indication
		for _, sp := range g.Spectators {
			type ReplayIndicatorMessage struct {
				Order int `json:"order"`
			}
			sp.Session.Emit("replayIndicator", &ReplayIndicatorMessage{
				Order: d.Order,
			})
		}
	} else if d.Type == replayActionTypeLeaderTransfer {
		// A leader transfer
		// Validate that the person that they are passing off the leader to actually exists in the game
		newLeaderID := -1
		for _, sp := range g.Spectators {
			if sp.Name == d.Name {
				newLeaderID = sp.ID
				break
			}
		}
		if newLeaderID == -1 {
			s.Error("That is an invalid username to pass leadership to.")
			return
		}

		// Mark them as the new replay leader
		g.Owner = newLeaderID

		// Tell everyone about the new leader
		// (which will enable the replay controls for the leader)
		for _, sp := range g.Spectators {
			sp.Session.NotifyReplayLeader(g)
		}
	} else if d.Type == replayActionTypeMorph {
		// A "hypothetical" card morph
		for _, sp := range g.Spectators {
			type ReplayMorphMessage struct {
				Order int `json:"order"`
				Suit  int `json:"suit"`
				Rank  int `json:"rank"`
			}
			sp.Session.Emit("replayMorph", &ReplayMorphMessage{
				Order: d.Order,
				Suit:  d.Suit,
				Rank:  d.Rank,
			})
		}
	} else if d.Type == replayActionTypeSound {
		// A sound effect
		for _, sp := range g.Spectators {
			type ReplaySoundMessage struct {
				Sound string `json:"sound"`
			}
			sp.Session.Emit("replaySound", &ReplaySoundMessage{
				Sound: d.Sound,
			})
		}
	} else if d.Type == replayActionTypeHypoStart {
		if g.Hypothetical {
			s.Warning("You are already in a hypothetical, so you cannot start a new one.")
			return
		}

		// Start a hypothetical line
		g.Hypothetical = true
		for _, sp := range g.Spectators {
			sp.Session.Emit("hypoStart", nil)
		}
	} else if d.Type == replayActionTypeHypoEnd {
		if !g.Hypothetical {
			s.Warning("You are not in a hypothetical, so you cannot end one.")
			return
		}

		// End a hypothetical line
		g.Hypothetical = false
		g.HypoActions = make([]string, 0)
		for _, sp := range g.Spectators {
			sp.Session.Emit("hypoEnd", nil)
		}
	} else if d.Type == replayActionTypeHypoAction {
		// Validate that the submitted action is not empty
		if d.ActionJSON == "" {
			s.Warning("The action JSON cannot be blank.")
			return
		}

		// Test to see if it is valid JSON
		var js json.RawMessage
		if json.Unmarshal([]byte(d.ActionJSON), &js) != nil {
			s.Warning("That is not a valid JSON object.")
			return
		}

		// Perform a move in the hypothetical
		g.HypoActions = append(g.HypoActions, d.ActionJSON)
		for _, sp := range g.Spectators {
			sp.Session.Emit("hypoAction", d.ActionJSON)
		}
	} else {
		s.Error("That is an invalid type of shared replay action.")
		return
	}
}
