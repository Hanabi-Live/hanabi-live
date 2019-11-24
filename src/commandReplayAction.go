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
	"regexp"
	"strconv"
)

var (
	actionTypeTurnRegExp = regexp.MustCompile(`"type":\s*"turn"`)
)

func commandReplayAction(s *Session, d *CommandData) {
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

	// Validate that this is a shared replay
	if !t.Replay || !t.Visible {
		s.Warning("Table " + strconv.Itoa(tableID) + " is not a shared replay, " +
			"so you cannot send a shared replay action.")
		return
	}

	// Validate that this person is leading the review
	if s.UserID() != t.Owner {
		s.Warning("You cannot send a shared replay action unless you are the leader.")
		return
	}

	/*
		Replay action
	*/

	// Start the idle timeout
	go t.CheckIdle()

	// Send the message to everyone else
	if d.Type == replayActionTypeTurn {
		// A turn change
		g.Turn = d.Turn
		for _, sp := range t.Spectators {
			type ReplayTurnMessage struct {
				Turn int `json:"turn"`
			}
			sp.Session.Emit("replayTurn", &ReplayTurnMessage{
				Turn: d.Turn,
			})
		}

		// Update the progress
		progress := float64(g.Turn) / float64(g.EndTurn) * 100 // In percent
		t.Progress = int(math.Round(progress))                 // Round it to the nearest integer
		if t.Progress > 100 {
			// It is possible to go past the last turn,
			// since an extra turn is appended to the end of every game with timing information
			t.Progress = 100
		} else if t.Progress < 0 {
			// This can happen if the maximum turn is 0
			t.Progress = 0
		}

		// Send every user connected an update about this table
		// (this is sort of wasteful but is necessary for users to see the progress of the replay from the lobby)
		notifyAllTable(t)
	} else if d.Type == replayActionTypeArrow {
		// A card arrow indication
		for _, sp := range t.Spectators {
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
		for _, sp := range t.Spectators {
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
		t.Owner = newLeaderID

		// Tell everyone about the new leader
		// (which will enable the replay controls for the leader)
		for _, sp := range t.Spectators {
			sp.Session.NotifyReplayLeader(t, true)
		}
	} else if d.Type == replayActionTypeSound {
		// A sound effect
		for _, sp := range t.Spectators {
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
		for _, sp := range t.Spectators {
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
		for _, sp := range t.Spectators {
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
		for _, sp := range t.Spectators {
			sp.Session.Emit("hypoAction", d.ActionJSON)
		}
	} else if d.Type == replayActionTypeHypoBack {
		// The replay leader wants to go back one turn in the hypothetical
		if len(g.HypoActions) == 0 {
			return
		}

		// Starting from the end,
		// remove hypothetical actions until we get to the 2nd to last "turn" action
		for {
			// Delete the final element in the slice
			g.HypoActions = g.HypoActions[:len(g.HypoActions)-1]
			if len(g.HypoActions) == 0 {
				break
			}

			lastActionString := g.HypoActions[len(g.HypoActions)-1]
			match := actionTypeTurnRegExp.FindStringSubmatch(lastActionString)
			if match != nil {
				break
			}
		}

		for _, sp := range t.Spectators {
			sp.Session.Emit("hypoBack", nil)
		}
	} else {
		s.Error("That is an invalid type of shared replay action.")
		return
	}
}
