package main

import (
	"strings"
)

/*
	Notifications before a game has started
*/

// NotifyPlayerChange sends the people in the pre-game an update about the new amount of players
// This is only called in situations where the game has not started yet
func (t *Table) NotifyPlayerChange() {
	if t.Running {
		logger.Error("The \"NotifyPlayerChange()\" function was called on a game that has already started.")
		return
	}

	for _, p := range t.Players {
		if !p.Present {
			continue
		}

		// First, make the array that contains information about all of the players in the game
		type GamePlayerMessage struct {
			Index   int          `json:"index"`
			Name    string       `json:"name"`
			You     bool         `json:"you"`
			Present bool         `json:"present"`
			Stats   PregameStats `json:"stats"`
		}
		gamePlayers := make([]*GamePlayerMessage, 0)
		for j, p2 := range t.Players {
			gamePlayer := &GamePlayerMessage{
				Index:   j,
				Name:    p2.Name,
				You:     p.ID == p2.ID,
				Present: p2.Present,
				Stats:   p2.Stats,
			}
			gamePlayers = append(gamePlayers, gamePlayer)
		}

		// Second, send information about the game and the players in one big message
		type GameMessage struct {
			Name                 string               `json:"name"`
			Players              []*GamePlayerMessage `json:"players"`
			Variant              string               `json:"variant"`
			Timed                bool                 `json:"timed"`
			BaseTime             int                  `json:"baseTime"`
			TimePerTurn          int                  `json:"timePerTurn"`
			Speedrun             bool                 `json:"speedrun"`
			CardCycle            bool                 `json:"cardCycle"`
			DeckPlays            bool                 `json:"deckPlays"`
			EmptyClues           bool                 `json:"emptyClues"`
			CharacterAssignments bool                 `json:"characterAssignments"`
			Password             bool                 `json:"password"`
		}
		p.Session.Emit("game", &GameMessage{
			Name:                 t.Name,
			Players:              gamePlayers,
			Variant:              t.Options.Variant,
			Timed:                t.Options.Timed,
			BaseTime:             t.Options.BaseTime,
			TimePerTurn:          t.Options.TimePerTurn,
			Speedrun:             t.Options.Speedrun,
			CardCycle:            t.Options.CardCycle,
			DeckPlays:            t.Options.DeckPlays,
			EmptyClues:           t.Options.EmptyClues,
			CharacterAssignments: t.Options.CharacterAssignments,
			Password:             t.Password != "",
		})
	}
}

// NotifyTableReady disables or enables the "Start Game" button on the client
// This is only called in situations where the game has not started yet
func (t *Table) NotifyTableReady() {
	if t.Running {
		logger.Error("The \"NotifyTableReady()\" function was called on a game that has already started.")
		return
	}

	for _, p := range t.Players {
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
			Ready: len(t.Players) >= 2,
		})
		break
	}
}

/*
	Notifications after a game has started
*/

// NotifyConnected will send "connected" messages to everyone in a game
// (because someone just connected or disconnected)
// This is never called in replays
func (t *Table) NotifyConnected() {
	if !t.Running {
		logger.Error("The \"NotifyConnected()\" function was called on a game that has not started yet.")
		return
	}

	for _, p := range t.Players {
		if p.Present {
			p.Session.NotifyConnected(t)
		}
	}

	// Also send the spectators an update
	for _, sp := range t.Spectators {
		sp.Session.NotifyConnected(t)
	}
}

func (t *Table) NotifySpectators() {
	if !t.Visible {
		return
	}

	// If this is a replay, then all of the players are also spectators,
	// so we do not want to send them a duplicate message
	if !t.Replay {
		for _, p := range t.Players {
			if p.Present {
				p.Session.NotifySpectators(t)
			}
		}
	}

	for _, sp := range t.Spectators {
		sp.Session.NotifySpectators(t)
	}
}

// NotifyStatus appends a new "status" action and alerts everyone
func (t *Table) NotifyStatus(doubleDiscard bool) {
	g := t.Game
	g.Actions = append(g.Actions, ActionStatus{
		Type:          "status",
		Clues:         g.ClueTokens,
		Score:         g.Score,
		MaxScore:      g.MaxScore,
		DoubleDiscard: doubleDiscard,
	})
	t.NotifyAction()

	// If we are playing an "Up or Down" variant, we also need to send the stack directions
	if strings.HasPrefix(t.Options.Variant, "Up or Down") {
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

// NotifyAction sends the people in the game an update about the new action
func (t *Table) NotifyAction() {
	g := t.Game

	if !t.Running {
		// We might be doing the initial actions;
		// don't send any messages to players if this is the case
		return
	}

	// Get the last action of the game
	a := g.Actions[len(g.Actions)-1]

	for _, gp := range g.Players {
		p := t.Players[gp.Index]
		if p.Present {
			p.Session.NotifyGameAction(a, t)
		}
	}

	// Also send the spectators an update
	for _, sp := range t.Spectators {
		sp.Session.NotifyGameAction(a, t)
	}
}

// NotifySound sends a sound notification to everyone in the game
// (signifying that an action just occurred)
func (t *Table) NotifySound() {
	for i, p := range t.Players {
		if p.Present {
			p.Session.NotifySound(t, i)
		}
	}

	for _, sp := range t.Spectators {
		sp.Session.NotifySound(t, -1)
	}
}

func (t *Table) NotifyGameOver() {
	for _, p := range t.Players {
		if p.Present {
			p.Session.Emit("gameOver", nil)
		}
	}

	for _, sp := range t.Spectators {
		sp.Session.Emit("gameOver", nil)
	}
}

func (t *Table) NotifyTime() {
	for _, p := range t.Players {
		if p.Present {
			p.Session.NotifyTime(t)
		}
	}

	for _, sp := range t.Spectators {
		sp.Session.NotifyTime(t)
	}
}

func (t *Table) NotifyPause() {
	for _, p := range t.Players {
		if p.Present {
			p.Session.NotifyPause(t)
		}
	}

	for _, sp := range t.Spectators {
		sp.Session.NotifyPause(t)
	}
}

func (t *Table) NotifySpectatorsNote(order int) {
	g := t.Game

	// Make an array that contains the combined notes for all the players & spectators
	// (for a specific card)
	type Note struct {
		Name string `json:"name"`
		Note string `json:"note"`
	}
	notes := make([]Note, 0)
	for _, p := range g.Players {
		notes = append(notes, Note{
			Name: p.Name,
			Note: p.Notes[order],
		})
	}
	for _, sp := range t.Spectators {
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
	for _, sp := range t.Spectators {
		sp.Session.Emit("note", &NoteMessage{
			Order: order,
			Notes: notes,
		})
	}
}

// NotifyBoot boots the people in a game or shared replay back to the lobby screen
func (t *Table) NotifyBoot() {
	if !t.Replay {
		for _, p := range t.Players {
			if p.Present {
				p.Session.Emit("boot", nil)
			}
		}
	}

	for _, sp := range t.Spectators {
		sp.Session.Emit("boot", nil)
	}
}
