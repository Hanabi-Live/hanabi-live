package main

// Options are things that are specified about the game upon table creation (before the game starts)
// All of these are stored in the database as columns of the "games" table
// A pointer to these options is copied into the Game struct when the game starts for convenience
type Options struct {
	NumPlayers            int    `json:"numPlayers"`
	StartingPlayer        int    `json:"startingPlayer"` // Legacy field for games prior to April 2020
	VariantName           string `json:"variantName"`
	Timed                 bool   `json:"timed"`
	TimeBase              int    `json:"timeBase"`
	TimePerTurn           int    `json:"timePerTurn"`
	Speedrun              bool   `json:"speedrun"`
	CardCycle             bool   `json:"cardCycle"`
	DeckPlays             bool   `json:"deckPlays"`
	EmptyClues            bool   `json:"emptyClues"`
	OneExtraCard          bool   `json:"oneExtraCard"`
	OneLessCard           bool   `json:"oneLessCard"`
	AllOrNothing          bool   `json:"allOrNothing"`
	DetrimentalCharacters bool   `json:"detrimentalCharacters"`
}

// ExtraOptions are extra specifications for the game; they are not recorded in the database
// Similar to Options, a pointer to ExtraOptions is copied into the Game struct for convenience
type ExtraOptions struct {
	// Whether or not this is a game created from a replay or a user-submitted JSON array
	Replay     bool
	DatabaseID int             // For replays created from the database (or "!replay" games)
	CustomDeck []*CardIdentity // For replays created from arbitrary JSON data

	Restarted bool // Whether or not this game was created by clicking "Restart" in a replay

	// The rest of the options are parsed from the game name
	// (for "!seed", "!replay", and "!deal" games respectively)
	SetSeedSuffix string
	SetReplay     bool
	SetReplayTurn int
	SetDeal       string
}

// To minimize JSON output, we need to use pointers to each option instead of the normal type
type OptionsJSON struct {
	StartingPlayer        *int    `json:"startingPlayer,omitempty"`
	Variant               *string `json:"variant,omitempty"`
	Timed                 *bool   `json:"timed,omitempty"`
	TimeBase              *int    `json:"timeBase,omitempty"`
	TimePerTurn           *int    `json:"timePerTurn,omitempty"`
	Speedrun              *bool   `json:"speedrun,omitempty"`
	CardCycle             *bool   `json:"cardCycle,omitempty"`
	DeckPlays             *bool   `json:"deckPlays,omitempty"`
	EmptyClues            *bool   `json:"emptyClues,omitempty"`
	OneExtraCard          *bool   `json:"oneExtraCard,omitempty"`
	OneLessCard           *bool   `json:"oneLessCard,omitempty"`
	AllOrNothing          *bool   `json:"allOrNothing,omitempty"`
	DetrimentalCharacters *bool   `json:"detrimentalCharacters,omitempty"`
}
