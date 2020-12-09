package options

import (
	"github.com/Zamiell/hanabi-live/server/pkg/bitmask"
	"github.com/Zamiell/hanabi-live/server/pkg/constants"
	"github.com/Zamiell/hanabi-live/server/pkg/variants"
)

// Options are things that are specified about the game upon table creation (before the game starts)
// All of these are stored in the database as columns of the "games" table
// A pointer to these options is copied into the Game struct when the game starts for convenience
type Options struct {
	NumPlayers int `json:"numPlayers"`
	// StartingPlayer is a legacy field for games prior to April 2020
	StartingPlayer        int    `json:"startingPlayer"`
	VariantID             int    `json:"variantID"`
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

// To minimize JSON output, we need to use pointers to each option instead of the normal type
type JSON struct {
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

// ExtraOptions are extra specifications for the game; they are not recorded in the database
// Similar to Options, a pointer to ExtraOptions is copied into the Game struct for convenience
type ExtraOptions struct {
	// -1 if an ongoing game, 0 if a JSON replay,
	// a positive number if a database replay (or a "!replay" table)
	DatabaseID int

	// Normal games are written to the database
	// Replays are not written to the database
	NoWriteToDatabase bool
	JSONReplay        bool

	// Replays have some predetermined values
	// Some special game types also use these fields (e.g. "!replay" games)
	CustomNumPlayers           int
	CustomCharacterAssignments []*CharacterAssignment
	CustomSeed                 string
	CustomDeck                 []*CardIdentity
	CustomActions              []*GameAction

	Restarted     bool   // Whether or not this game was created by clicking "Restart" in a shared replay
	SetSeedSuffix string // Parsed from the game name for "!seed" games
	SetReplay     bool   // True during "!replay" games
	SetReplayTurn int    // Parsed from the game name for "!replay" games
}

type CharacterAssignment struct {
	Name     string `json:"name"`
	Metadata int    `json:"metadata"`
}

type CardIdentity struct {
	SuitIndex int `json:"suitIndex"`
	Rank      int `json:"rank"`
}

// These fields are described in "database_schema.sql"
type GameAction struct {
	Type   int `json:"type"`
	Target int `json:"target"`
	Value  int `json:"value"`
}

func NewOptions() *Options {
	return &Options{
		NumPlayers:            0, // This will be written when the game starts
		StartingPlayer:        0,
		VariantID:             0,
		VariantName:           variants.DefaultVariantName,
		Timed:                 false,
		TimeBase:              0,
		TimePerTurn:           0,
		Speedrun:              false,
		CardCycle:             false,
		DeckPlays:             false,
		EmptyClues:            false,
		OneExtraCard:          false,
		OneLessCard:           false,
		AllOrNothing:          false,
		DetrimentalCharacters: false,
	}
}

// GetModifier computes the integer modifier for the game options,
// corresponding to the "ScoreModifier" constants in "constants.go"
func (o *Options) GetModifier() bitmask.Bitmask {
	var modifier bitmask.Bitmask

	if o.DeckPlays {
		modifier.AddFlag(constants.ScoreModifierDeckPlays)
	}
	if o.EmptyClues {
		modifier.AddFlag(constants.ScoreModifierEmptyClues)
	}
	if o.OneExtraCard {
		modifier.AddFlag(constants.ScoreModifierOneExtraCard)
	}
	if o.OneLessCard {
		modifier.AddFlag(constants.ScoreModifierOneLessCard)
	}
	if o.AllOrNothing {
		modifier.AddFlag(constants.ScoreModifierAllOrNothing)
	}

	return modifier
}
