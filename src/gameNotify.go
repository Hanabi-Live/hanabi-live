package main

import (
	"strings"

	"github.com/Zamiell/hanabi-live/src/models"
)

/*
	Notify functions
*/

// NotifyPlayerChange sends the people in the pre-game an update about the new amount of players
// This is only called in situations where the game has not started yet
func (g *Game) NotifyPlayerChange() {
	if g.Running {
		log.Error("The \"NotifyPlayerChange()\" function was called on a game that has already started.")
		return
	}

	for _, p := range g.Players {
		if !p.Present {
			continue
		}

		// First, make the array that contains information about all of the players in the game
		type GamePlayerMessage struct {
			Index   int          `json:"index"`
			Name    string       `json:"name"`
			You     bool         `json:"you"`
			Present bool         `json:"present"`
			Stats   models.Stats `json:"stats"`
		}
		gamePlayers := make([]*GamePlayerMessage, 0)
		for j, p2 := range g.Players {
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
			Running              bool                 `json:"running"`
			Players              []*GamePlayerMessage `json:"players"`
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
		p.Session.Emit("game", &GameMessage{
			Name:                 g.Name,
			Running:              g.Running,
			Players:              gamePlayers,
			Variant:              g.Options.Variant,
			Timed:                g.Options.Timed,
			BaseTime:             g.Options.BaseTime,
			TimePerTurn:          g.Options.TimePerTurn,
			Speedrun:             g.Options.Speedrun,
			DeckPlays:            g.Options.DeckPlays,
			EmptyClues:           g.Options.EmptyClues,
			CharacterAssignments: g.Options.CharacterAssignments,
			Correspondence:       g.Options.Correspondence,
			Password:             g.Password != "",
		})
	}
}

// NotifyTableReady disables or enables the "Start Game" button on the client
// This is only called in situations where the game has not started yet
func (g *Game) NotifyTableReady() {
	if g.Running {
		log.Error("The \"NotifyTableReady()\" function was called on a game that has already started.")
		return
	}

	for _, p := range g.Players {
		if p.ID != g.Owner {
			continue
		}

		if !p.Present {
			continue
		}

		type TableReadyMessage struct {
			Ready bool `json:"ready"`
		}
		p.Session.Emit("tableReady", &TableReadyMessage{
			Ready: len(g.Players) >= 2,
		})
		break
	}
}

// NotifyConnected will send "connected" messages to everyone in a game
// (because someone just connected or disconnected)
// This is only called in situations where the game has started
// This is never called in replays
func (g *Game) NotifyConnected() {
	if !g.Running {
		log.Error("The \"NotifyConnected()\" function was called on a game that has not started yet.")
		return
	}

	for _, p := range g.Players {
		if p.Present {
			p.Session.NotifyConnected(g)
		}
	}

	// Also send the spectators an update
	for _, sp := range g.Spectators {
		sp.Session.NotifyConnected(g)
	}
}

// NotifyStatus appends a new "status" action and alerts everyone
// This is only called in situations where the game has started
func (g *Game) NotifyStatus(doubleDiscard bool) {
	g.Actions = append(g.Actions, ActionStatus{
		Type:          "status",
		Clues:         g.Clues,
		Score:         g.Score,
		MaxScore:      g.MaxScore,
		DoubleDiscard: doubleDiscard,
	})
	g.NotifyAction()

	// If we are playing an "Up or Down" variant, we also need to send the stack directions
	if strings.HasPrefix(g.Options.Variant, "Up or Down") {
		// Since StackDirections is a slice, it will be stored as a pointer
		// (unlike the primitive values that we used for the ActionStatus message above)
		// So, make a copy to preserve the stack directions for this exact moment in time
		stackDirections := make([]int, len(g.StackDirections))
		copy(stackDirections, g.StackDirections)
		g.Actions = append(g.Actions, ActionStackDirections{
			Type:       "stackDirections",
			Directions: stackDirections,
		})
		g.NotifyAction()
	}
}

// NotifyTurn appends a new "turn" action and alerts everyone
// This is only called in situations where the game has started
func (g *Game) NotifyTurn() {
	who := g.ActivePlayer
	if g.EndCondition > endConditionInProgress {
		who = -1
	}
	g.Actions = append(g.Actions, ActionTurn{
		Type: "turn",
		Num:  g.Turn,
		Who:  who,
	})
	g.NotifyAction()
}

// NotifyAction sends the people in the game an update about the new action
// This is only called in situations where the game has started
func (g *Game) NotifyAction() {
	if !g.Running {
		log.Error("The \"NotifyAction()\" function was called on a game that has not started yet.")
		return
	}

	// Get the last action of the game
	a := g.Actions[len(g.Actions)-1]

	for _, p := range g.Players {
		if p.Present {
			p.Session.NotifyGameAction(a, g, p)
		}
	}

	// Also send the spectators an update
	for _, sp := range g.Spectators {
		sp.Session.NotifyGameAction(a, g, nil)
	}
}

// NotifySound sends a sound notification to everyone in the game
// (signifying that an action just occurred)
func (g *Game) NotifySound() {
	for i, p := range g.Players {
		if p.Present {
			p.Session.NotifySound(g, i)
		}
	}

	for _, sp := range g.Spectators {
		sp.Session.NotifySound(g, -1)
	}
}

func (g *Game) NotifyGameOver() {
	for _, p := range g.Players {
		if p.Present {
			p.Session.Emit("gameOver", nil)
		}
	}

	for _, sp := range g.Spectators {
		sp.Session.Emit("gameOver", nil)
	}
}

func (g *Game) NotifyTime() {
	for _, p := range g.Players {
		if p.Present {
			p.Session.NotifyTime(g)
		}
	}

	for _, sp := range g.Spectators {
		sp.Session.NotifyTime(g)
	}
}

func (g *Game) NotifyPause() {
	for _, p := range g.Players {
		if p.Present {
			p.Session.NotifyPause(g)
		}
	}

	for _, sp := range g.Spectators {
		sp.Session.NotifyPause(g)
	}
}

func (g *Game) NotifySpectators() {
	if !g.Visible {
		return
	}

	// If this is a replay, then all of the players are also spectators,
	// so we do not want to send them a duplicate message
	if !g.Replay {
		for _, p := range g.Players {
			if p.Present {
				p.Session.NotifySpectators(g)
			}
		}
	}

	for _, sp := range g.Spectators {
		sp.Session.NotifySpectators(g)
	}
}

func (g *Game) NotifySpectatorsNote(order int) {
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
	for _, sp := range g.Spectators {
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
	for _, sp := range g.Spectators {
		sp.Session.Emit("note", &NoteMessage{
			Order: order,
			Notes: notes,
		})
	}
}

// Boot the people in the game and/or shared replay back to the lobby screen
func (g *Game) NotifyBoot() {
	if !g.Replay {
		for _, p := range g.Players {
			if p.Present {
				p.Session.Emit("boot", nil)
			}
		}
	}

	for _, sp := range g.Spectators {
		sp.Session.Emit("boot", nil)
	}
}
