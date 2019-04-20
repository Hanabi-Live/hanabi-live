/*
	Sent when the user:
	- is in a game that is starting
	- joins a game that has already started
	- starts a solo replay
	- starts spectating a game

	This is sent before the UI is initialized; the client will send a "ready"
	message later to get more data

	"data" is empty
*/

package main

import (
	"strconv"
)

func commandHello(s *Session, d *CommandData) {
	/*
		Validate
	*/

	// Validate that the game exists
	gameID := s.CurrentGame()
	var g *Game
	if v, ok := games[gameID]; !ok {
		s.Error("Game " + strconv.Itoa(gameID) + " does not exist.")
		return
	} else {
		g = v
	}

	// Validate that the game has started
	if !g.Running {
		s.Warning("Game " + strconv.Itoa(gameID) + " has not started yet.")
		return
	}

	// Validate that they are either playing or spectating the game
	i := g.GetPlayerIndex(s.UserID())
	j := g.GetSpectatorIndex(s.UserID())
	if i == -1 && j == -1 {
		s.Warning("You are not playing or spectating game " + strconv.Itoa(gameID) + ".")
		return
	}

	/*
		Hello
	*/

	// Create a list of names of the users in this game
	names := make([]string, 0)
	for _, p := range g.Players {
		names = append(names, p.Name)
	}

	// Create a list of the "Detrimental Character Assignments", if enabled
	characterAssignments := make([]string, 0)
	characterMetadata := make([]int, 0)
	if g.Options.CharacterAssignments {
		for _, p := range g.Players {
			characterAssignments = append(characterAssignments, p.Character)
			characterMetadata = append(characterMetadata, p.CharacterMetadata)
		}
	}

	// Find out what seat number (index) this user is sitting in
	seat := 0 // By default, assume a seat of 0
	for i, p := range g.Players {
		if p.ID == s.UserID() {
			seat = i
			break
		}
	}
	// If this is a replay of a game they were not in (or if they are spectating),
	// the above if statement will never be reached, and they will be in seat 0

	// Account for if a spectator is shadowing a specific player
	if j != -1 && g.Spectators[j].Shadowing {
		seat = g.Spectators[j].PlayerIndex
	}

	id := g.DatabaseID
	if id == 0 {
		id = g.ID
	}

	pauseQueued := g.Players[seat].RequestedPause
	if i == -1 {
		pauseQueued = false
	}

	// Give them an "init" message
	type InitMessage struct {
		// Game settings
		Names        []string `json:"names"`
		Variant      string   `json:"variant"`
		Seat         int      `json:"seat"`
		Spectating   bool     `json:"spectating"`
		Replay       bool     `json:"replay"`
		SharedReplay bool     `json:"sharedReplay"`
		ID           int      `json:"id"`

		// Optional settings
		Timed                bool     `json:"timed"`
		BaseTime             int      `json:"baseTime"`
		TimePerTurn          int      `json:"timePerTurn"`
		Speedrun             bool     `json:"speedrun"`
		DeckPlays            bool     `json:"deckPlays"`
		EmptyClues           bool     `json:"emptyClues"`
		CharacterAssignments []string `json:"characterAssignments"`
		CharacterMetadata    []int    `json:"characterMetadata"`
		Correspondence       bool     `json:"correspondence"`

		// Hypothetical settings
		Hypothetical bool     `json:"hypothetical"`
		HypoActions  []string `json:"hypoActions"`

		// Other features
		Paused      bool   `json:"paused"`
		PausePlayer string `json:"pausePlayer"`
		PauseQueued bool   `json:"pauseQueued"`
	}

	s.Emit("init", &InitMessage{
		// Game settings
		Names:        names,
		Variant:      g.Options.Variant,
		Seat:         seat,
		Spectating:   s.Status() == statusSpectating,
		Replay:       s.Status() == statusReplay || s.Status() == statusSharedReplay,
		SharedReplay: s.Status() == statusSharedReplay,
		ID:           id,

		// Optional settings
		Timed:                g.Options.Timed,
		BaseTime:             g.Options.BaseTime,
		TimePerTurn:          g.Options.TimePerTurn,
		Speedrun:             g.Options.Speedrun,
		DeckPlays:            g.Options.DeckPlays,
		EmptyClues:           g.Options.EmptyClues,
		CharacterAssignments: characterAssignments,
		CharacterMetadata:    characterMetadata,
		Correspondence:       g.Options.Correspondence,

		// Hypothetical settings
		Hypothetical: g.Hypothetical,
		HypoActions:  g.HypoActions,

		// Other features
		Paused:      g.Paused,
		PausePlayer: g.Players[g.PausePlayer].Name,
		PauseQueued: pauseQueued,
	})
}
