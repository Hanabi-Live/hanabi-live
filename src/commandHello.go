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

	// Validate that the game has started
	if !t.Running {
		s.Warning("The game for table " + strconv.Itoa(tableID) + " has not started yet.")
		return
	}

	// Validate that they are either playing or spectating the game
	i := t.GetPlayerIndexFromID(s.UserID())
	j := t.GetSpectatorIndexFromID(s.UserID())
	if i == -1 && j == -1 {
		s.Warning("You are not playing or spectating at table " + strconv.Itoa(tableID) + ".")
		return
	}

	/*
		Hello
	*/

	// Create a list of names of the users in this game
	names := make([]string, 0)
	for _, p := range t.Players {
		names = append(names, p.Name)
	}

	// Create a list of the "Detrimental Character Assignments", if enabled
	characterAssignments := make([]string, 0)
	characterMetadata := make([]int, 0)
	if t.Options.CharacterAssignments {
		for _, p := range g.Players {
			characterAssignments = append(characterAssignments, p.Character)
			characterMetadata = append(characterMetadata, p.CharacterMetadata)
		}
	}

	// The seat number is equal to the index of the player in the Players slice
	seat := i
	if seat == -1 {
		// Spectators view the game from the first players perspective
		seat = 0
	}

	// Account for if a spectator is shadowing a specific player
	if j != -1 && t.Spectators[j].Shadowing {
		seat = t.Spectators[j].PlayerIndex
	}

	pauseQueued := false
	if i != -1 {
		pauseQueued = g.Players[i].RequestedPause
	}

	// Give them an "init" message
	type InitMessage struct {
		// Game settings
		TableID      int      `json:"tableID"`
		Names        []string `json:"names"`
		Variant      string   `json:"variant"`
		Seat         int      `json:"seat"`
		Spectating   bool     `json:"spectating"`
		Replay       bool     `json:"replay"`
		SharedReplay bool     `json:"sharedReplay"`
		DatabaseID   int      `json:"databaseID"`

		// Optional settings
		Timed                bool     `json:"timed"`
		BaseTime             int      `json:"baseTime"`
		TimePerTurn          int      `json:"timePerTurn"`
		Speedrun             bool     `json:"speedrun"`
		CardCycle            bool     `json:"cardCycle"`
		DeckPlays            bool     `json:"deckPlays"`
		EmptyClues           bool     `json:"emptyClues"`
		CharacterAssignments []string `json:"characterAssignments"`
		CharacterMetadata    []int    `json:"characterMetadata"`

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
		TableID:      t.ID, // The client needs to know the table ID for chat to work properly
		Names:        names,
		Variant:      t.Options.Variant,
		Seat:         seat,
		Spectating:   s.Status() == statusSpectating,
		Replay:       s.Status() == statusReplay || s.Status() == statusSharedReplay,
		SharedReplay: s.Status() == statusSharedReplay,
		DatabaseID:   g.ID,

		// Optional settings
		Timed:                t.Options.Timed,
		BaseTime:             t.Options.BaseTime,
		TimePerTurn:          t.Options.TimePerTurn,
		Speedrun:             t.Options.Speedrun,
		CardCycle:            t.Options.CardCycle,
		DeckPlays:            t.Options.DeckPlays,
		EmptyClues:           t.Options.EmptyClues,
		CharacterAssignments: characterAssignments,
		CharacterMetadata:    characterMetadata,

		// Hypothetical settings
		Hypothetical: g.Hypothetical,
		HypoActions:  g.HypoActions,

		// Other features
		Paused:      g.Paused,
		PausePlayer: t.Players[g.PausePlayer].Name,
		PauseQueued: pauseQueued,
	})
}
