package main

import (
	"strconv"
	"strings"
	"time"
)

// commandGetGameInfo1 provides some high-level information about the game
// (like the number of players)
// It is sent when the user:
// - is in a game that is starting
// - joins a game that has already started
// - starts a solo replay
// - starts spectating a game
//
// This is sent before the UI is initialized;
// the client will send a "getGameInfo2" command later to get more specific data
//
// Example data:
// {
//   tableID: 5,
// }
func commandGetGameInfo1(s *Session, d *CommandData) {
	/*
		Validate
	*/

	// Validate that the table exists
	tableID := d.TableID
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
		s.Warning(ChatCommandNotStartedFail)
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
		Provide the info
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
		// By default, spectators view the game from the first player's perspective
		seat = 0

		// If a spectator is viewing a replay of a game that they played in,
		// we want to put them in the same seat
		for k, name := range names {
			if name == s.Username() {
				seat = k
				break
			}
		}
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
		TableID          int       `json:"tableID"`
		Names            []string  `json:"names"`
		Variant          string    `json:"variant"`
		Seat             int       `json:"seat"`
		Spectating       bool      `json:"spectating"`
		Replay           bool      `json:"replay"`
		SharedReplay     bool      `json:"sharedReplay"`
		DatabaseID       int       `json:"databaseID"`
		Seed             string    `json:"seed"`
		Seeded           bool      `json:"seeded"`
		DatetimeStarted  time.Time `json:"datetimeStarted"`
		DatetimeFinished time.Time `json:"datetimeFinished"`

		// Optional settings
		Timed                bool     `json:"timed"`
		TimeBase             int      `json:"timeBase"`
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
		HypoRevealed bool     `json:"hypoRevealed"`

		// Other features
		Paused      bool   `json:"paused"`
		PausePlayer string `json:"pausePlayer"`
		PauseQueued bool   `json:"pauseQueued"`
	}

	s.Emit("init", &InitMessage{
		// Game settings
		TableID:          t.ID, // The client needs to know the table ID for chat to work properly
		Names:            names,
		Variant:          t.Options.Variant,
		Seat:             seat,
		Spectating:       !t.Replay && j != -1,
		Replay:           t.Replay,
		SharedReplay:     t.Replay && t.Visible,
		DatabaseID:       g.ID,
		Seed:             g.Seed,
		Seeded:           strings.HasPrefix(t.Name, "!seed "),
		DatetimeStarted:  g.DatetimeStarted,
		DatetimeFinished: g.DatetimeFinished,

		// Optional settings
		Timed:                t.Options.Timed,
		TimeBase:             t.Options.TimeBase,
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
		HypoRevealed: g.HypoRevealed,

		// Other features
		Paused:      g.Paused,
		PausePlayer: t.Players[g.PausePlayer].Name,
		PauseQueued: pauseQueued,
	})
}
