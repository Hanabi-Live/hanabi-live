/*
	Sent when the user:
	- is in a table that is starting
	- joins a table that has already started
	- starts a solo replay
	- starts spectating a table

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

	// Validate that the table exists
	tableID := s.CurrentTable()
	var t *Table
	if v, ok := tables[tableID]; !ok {
		s.Error("Table " + strconv.Itoa(tableID) + " does not exist.")
		return
	} else {
		t = v
	}

	// Validate that the table has started
	if !t.Game.Running {
		s.Warning("Table " + strconv.Itoa(tableID) + " has not started yet.")
		return
	}

	// Validate that they are either playing or spectating the table
	i := t.GameSpec.GetPlayerIndex(s.UserID())
	j := t.GetSpectatorIndex(s.UserID())
	if i == -1 && j == -1 {
		s.Warning("You are not playing or spectating table " + strconv.Itoa(tableID) + ".")
		return
	}

	/*
		Hello
	*/

	// Create a list of names of the users in this table
	names := make([]string, 0)
	for _, p := range t.GameSpec.Players {
		names = append(names, p.Name)
	}

	// Create a list of the "Detrimental Character Assignments", if enabled
	characterAssignments := make([]string, 0)
	characterMetadata := make([]int, 0)
	if t.GameSpec.Options.CharacterAssignments {
		for _, p := range t.GameSpec.Players {
			characterAssignments = append(characterAssignments, p.Character)
			characterMetadata = append(characterMetadata, p.CharacterMetadata)
		}
	}

	// Find out what seat number (index) this user is sitting in
	seat := 0 // By default, assume a seat of 0
	for i, p := range t.GameSpec.Players {
		if p.ID == s.UserID() {
			seat = i
			break
		}
	}
	// If this is a replay of a table they were not in (or if they are spectating),
	// the above if statement will never be reached, and they will be in seat 0

	// Account for if a spectator is shadowing a specific player
	if j != -1 && t.Spectators[j].Shadowing {
		seat = t.Spectators[j].PlayerIndex
	}

	id := t.Game.ID
	if id == 0 {
		id = t.ID
	}

	pauseQueued := t.GameSpec.Players[seat].RequestedPause
	if i == -1 {
		pauseQueued = false
	}

	// Give them an "init" message
	type InitMessage struct {
		// Table settings
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
		// Table settings
		Names:        names,
		Variant:      t.GameSpec.Options.Variant,
		Seat:         seat,
		Spectating:   s.Status() == statusSpectating,
		Replay:       s.Status() == statusReplay || s.Status() == statusSharedReplay,
		SharedReplay: s.Status() == statusSharedReplay,
		ID:           id,

		// Optional settings
		Timed:                t.GameSpec.Options.Timed,
		BaseTime:             t.GameSpec.Options.BaseTime,
		TimePerTurn:          t.GameSpec.Options.TimePerTurn,
		Speedrun:             t.GameSpec.Options.Speedrun,
		DeckPlays:            t.GameSpec.Options.DeckPlays,
		EmptyClues:           t.GameSpec.Options.EmptyClues,
		CharacterAssignments: characterAssignments,
		CharacterMetadata:    characterMetadata,
		Correspondence:       t.GameSpec.Options.Correspondence,

		// Hypothetical settings
		Hypothetical: t.Game.Hypothetical,
		HypoActions:  t.Game.HypoActions,

		// Other features
		Paused:      t.Game.Paused,
		PausePlayer: t.GameSpec.Players[t.Game.PausePlayer].Name,
		PauseQueued: pauseQueued,
	})
}
