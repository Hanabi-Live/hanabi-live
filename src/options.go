package main

// Options are things that are specified about the game upon table creation (before the game starts)
// The pointer is copied into the Game struct when the game starts for convenience
type Options struct {
	StartingPlayer       int // Legacy field for games prior to April 2020
	Variant              string
	Timed                bool
	TimeBase             int
	TimePerTurn          int
	Speedrun             bool
	CardCycle            bool
	DeckPlays            bool
	EmptyClues           bool
	CharacterAssignments bool

	// Whether or not this is a game created from a reply or a user-submitted JSON array
	Replay     bool
	DatabaseID int          // For replays created from the database (or "!replay" games)
	CustomDeck []SimpleCard // For replays created from arbitrary JSON data

	// The rest of the options are parsed from the game name
	// (for "!seed", "!replay", and "!deal" games respectively)
	SetSeedSuffix string
	SetReplay     bool
	SetReplayTurn int
	SetDeal       string
}

type OptionsJSON struct {
	Variant              *string `json:"variant,omitempty"`
	Timed                *bool   `json:"timed,omitempty"`
	TimeBase             *int    `json:"timeBase,omitempty"`
	TimePerTurn          *int    `json:"timePerTurn,omitempty"`
	Speedrun             *bool   `json:"speedrun,omitempty"`
	CardCycle            *bool   `json:"cardCycle,omitempty"`
	DeckPlays            *bool   `json:"deckPlays,omitempty"`
	EmptyClues           *bool   `json:"emptyClues,omitempty"`
	CharacterAssignments *bool   `json:"characterAssignments,omitempty"`
}
