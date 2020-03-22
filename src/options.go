package main

// Options are things that are specified about the game upon table creation (before the game starts)
// The pointer is copied into the Game struct when the game starts for convenience
type Options struct {
	Variant              string
	Timed                bool
	BaseTime             int
	TimePerTurn          int
	Speedrun             bool
	CardCycle            bool
	DeckPlays            bool
	EmptyClues           bool
	CharacterAssignments bool

	// Whether or not this is a game created from a user-submitted JSON array
	JSONGame bool

	// The rest of the options are parsed from the game name
	// (for "!seed", "!replay", and "!deal" games respectively)
	SetSeed       string
	SetReplay     int
	SetReplayTurn int
	SetDeal       string
}
