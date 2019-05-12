package main

import (
	"strings"

	"github.com/Zamiell/hanabi-live/src/models"
)

/*
	Notify functions
*/

// NotifyPlayerChange sends the people in the pre-game an update about the new amount of players
// This is only called in situations where the table has not started yet
func (t *Table) NotifyPlayerChange() {
        g := t.Game
        gs := t.GameSpec
        players := gs.Players
	if g.Running {
		log.Error("The \"NotifyPlayerChange()\" function was called on a table that has already started.")
		return
	}

	for _, p := range players {
		if !p.Present {
			continue
		}

		// First, make the array that contains information about all of the players in the table
		type TablePlayerMessage struct {
			Index   int          `json:"index"`
			Name    string       `json:"name"`
			You     bool         `json:"you"`
			Present bool         `json:"present"`
			Stats   models.Stats `json:"stats"`
		}
		tablePlayers := make([]*TablePlayerMessage, 0)
		for j, p2 := range players {
			tablePlayer := &TablePlayerMessage{
				Index:   j,
				Name:    p2.Name,
				You:     p.ID == p2.ID,
				Present: p2.Present,
				Stats:   p2.Stats,
			}
			tablePlayers = append(tablePlayers, tablePlayer)
		}

		// Second, send the information about the table and game specification
                // (visible in-pre-game and in-game), along with the information about the players 
		type TableGameMessage struct {
			Name                 string               `json:"name"`
			Running              bool                 `json:"running"`
			Players              []*TablePlayerMessage `json:"players"`
			Variant              string               `json:"variant"`
			Timed                bool                 `json:"timed"`
			BaseTime             int                  `json:"baseTime"`
			TimePerTurn          int                  `json:"timePerTurn"`
			Speedrun             bool                 `json:"speedrun"`
			DeckPlays            bool                 `json:"deckPlays"`
			EmptyClues           bool                 `json:"emptyClues"`
			CharacterAssignments bool                 `json:"characterAssignments"`
			Correspondence       bool                 `json:"correspondence"`
			Password             bool                 `json:"password"`
		}
		p.Session.Emit("tableGame", &TableGameMessage{
			Name:                 t.Name,
			Running:              t.Game.Running,
			Players:              tablePlayers,
			Variant:              t.GameSpec.Options.Variant,
			Timed:                t.GameSpec.Options.Timed,
			BaseTime:             t.GameSpec.Options.BaseTime,
			TimePerTurn:          t.GameSpec.Options.TimePerTurn,
			Speedrun:             t.GameSpec.Options.Speedrun,
			DeckPlays:            t.GameSpec.Options.DeckPlays,
			EmptyClues:           t.GameSpec.Options.EmptyClues,
			CharacterAssignments: t.GameSpec.Options.CharacterAssignments,
			Correspondence:       t.GameSpec.Options.Correspondence,
			Password:             t.Password != "",
		})
	}
}

// NotifyTableReady disables or enables the "Start Table" button on the client
// This is only called in situations where the table has not started yet
func (t *Table) NotifyTableReady() {
	if t.Game.Running {
		log.Error("The \"NotifyTableReady()\" function was called on a table that has already started.")
		return
	}

	for _, p := range t.GameSpec.Players {
		if p.ID != t.Owner {
			continue
		}

		if !p.Present {
			continue
		}

		type TableReadyMessage struct {
			Ready bool `json:"ready"`
		}
		p.Session.Emit("tableReady", &TableReadyMessage{
			Ready: len(t.GameSpec.Players) >= 2,
		})
		break
	}
}

// NotifyConnected will send "connected" messages to everyone in a table
// (because someone just connected or disconnected)
// This is only called in situations where the table has started
// This is never called in replays
func (t *Table) NotifyConnected() {
	if !t.Game.Running {
		log.Error("The \"NotifyConnected()\" function was called on a table that has not started yet.")
		return
	}

	for _, p := range t.GameSpec.Players {
		if p.Present {
			p.Session.NotifyConnected(t)
		}
	}

	// Also send the spectators an update
	for _, sp := range t.Spectators {
		sp.Session.NotifyConnected(t)
	}
}

// NotifyStatus appends a new "status" action and alerts everyone
// This is only called in situations where the table has started
func (t *Table) NotifyStatus(doubleDiscard bool) {
        g := t.Game
	g.Actions = append(g.Actions, ActionStatus{
		Type:          "status",
		Clues:         g.Clues,
		Score:         g.Score,
		MaxScore:      g.MaxScore,
		DoubleDiscard: doubleDiscard,
	})
	t.NotifyAction()

	// If we are playing an "Up or Down" variant, we also need to send the stack directions
	if strings.HasPrefix(t.GameSpec.Options.Variant, "Up or Down") {
		// Since StackDirections is a slice, it will be stored as a pointer
		// (unlike the primitive values that we used for the ActionStatus message above)
		// So, make a copy to preserve the stack directions for this exact moment in time
		stackDirections := make([]int, len(g.StackDirections))
		copy(stackDirections, g.StackDirections)
		g.Actions = append(g.Actions, ActionStackDirections{
			Type:       "stackDirections",
			Directions: stackDirections,
		})
		t.NotifyAction()
	}
}

// NotifyTurn appends a new "turn" action and alerts everyone
// This is only called in situations where the table has started
func (t *Table) NotifyTurn() {
        g := t.Game
	who := g.ActivePlayer
	if g.EndCondition > endConditionInProgress {
		who = -1
	}
	g.Actions = append(g.Actions, ActionTurn{
		Type: "turn",
		Num:  g.Turn,
		Who:  who,
	})
	t.NotifyAction()
}

// NotifyAction sends the people in the table an update about the new action
// This is only called in situations where the table has started
func (t *Table) NotifyAction() {
        g := t.Game
	if !g.Running {
		log.Error("The \"NotifyAction()\" function was called on a table that has not started yet.")
		return
	}

	// Get the last action of the table
	a := g.Actions[len(t.Game.Actions)-1]

	for _, p := range t.GameSpec.Players {
		if p.Present {
			p.Session.NotifyTableAction(a, t, p)
		}
	}

	// Also send the spectators an update
	for _, sp := range t.Spectators {
		sp.Session.NotifyTableAction(a, t, nil)
	}
}

// NotifySound sends a sound notification to everyone in the table
// (signifying that an action just occurred)
func (t *Table) NotifySound() {
	for i, p := range t.GameSpec.Players {
		if p.Present {
			p.Session.NotifySound(t, i)
		}
	}

	for _, sp := range t.Spectators {
		sp.Session.NotifySound(t, -1)
	}
}

func (t *Table) NotifyTableOver() {
	for _, p := range t.GameSpec.Players {
		if p.Present {
			p.Session.Emit("gameOver", nil)
		}
	}

	for _, sp := range t.Spectators {
		sp.Session.Emit("gameOver", nil)
	}
}

func (t *Table) NotifyTime() {
	for _, p := range t.GameSpec.Players {
		if p.Present {
			p.Session.NotifyTime(t)
		}
	}

	for _, sp := range t.Spectators {
		sp.Session.NotifyTime(t)
	}
}

func (t *Table) NotifyPause() {
	for _, p := range t.GameSpec.Players {
		if p.Present {
			p.Session.NotifyPause(t)
		}
	}

	for _, sp := range t.Spectators {
		sp.Session.NotifyPause(t)
	}
}

func (t *Table) NotifySpectators() {
	if !t.Visible {
		return
	}

	// If this is a replay, then all of the players are also spectators,
	// so we do not want to send them a duplicate message
	if !t.Game.Replay {
		for _, p := range t.GameSpec.Players {
			if p.Present {
				p.Session.NotifySpectators(t)
			}
		}
	}

	for _, sp := range t.Spectators {
		sp.Session.NotifySpectators(t)
	}
}

func (t *Table) NotifySpectatorsNote(order int) {
        spectators := &t.Spectators
	// Make an array that contains the combined notes for all the players & spectators
	// (for a specific card)
	type Note struct {
		Name string `json:"name"`
		Note string `json:"note"`
	}
	notes := make([]Note, 0)
	for _, p := range t.GameSpec.Players {
		notes = append(notes, Note{
			Name: p.Name,
			Note: p.Notes[order],
		})
	}
	for _, sp := range *spectators {
		notes = append(notes, Note{
			Name: sp.Name,
			Note: sp.Notes[order],
		})
	}

	type NoteMessage struct {
		// The order of the card in the deck that these notes correspond to
		Order int    `json:"order"`
		Notes []Note `json:"notes"`
	}
	for _, sp := range *spectators {
		sp.Session.Emit("note", &NoteMessage{
			Order: order,
			Notes: notes,
		})
	}
}

// Boot the people in the table and/or shared replay back to the lobby screen
func (t *Table) NotifyBoot() {
	if !t.Game.Replay {
		for _, p := range t.GameSpec.Players {
			if p.Present {
				p.Session.Emit("boot", nil)
			}
		}
	}

	for _, sp := range t.Spectators {
		sp.Session.Emit("boot", nil)
	}
}
