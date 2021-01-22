package table

import (
	"time"

	"github.com/Zamiell/hanabi-live/server/pkg/constants"
	"github.com/Zamiell/hanabi-live/server/pkg/options"
	"github.com/Zamiell/hanabi-live/server/pkg/variants"
)

// game is a sub-object of a table.
// It represents all of the particular state associated with a game.
// We need to export most fields so that the JSON encoder can serialize them during a graceful
// server restart.
// (Several fields must be skipped in order to prevent circular references.)
type game struct {
	// This is a reference to the parent object; every game must have a parent Table object
	table *table
	// These are references to the respective fields of the Table object (for convenience purposes)
	options      *options.Options
	extraOptions *options.ExtraOptions
	variant      *variants.Variant

	// This corresponds to the database field of "datetime_started"
	// It will be equal to "Table.DatetimeStarted" in an ongoing game that has not been written to
	// the database yet
	DatetimeStarted time.Time

	// This corresponds to the database field of "datetime_finished"
	// It will be blank in an ongoing game that has not been written to the database yet
	DatetimeFinished time.Time

	// Game state related fields
	Players []*gamePlayer
	// The seed specifies how the deck is dealt
	// It is either entered manually by players before the game starts or randomly selected by the
	// server upon starting a game
	Seed                string
	Deck                []*card
	CardIdentities      []*options.CardIdentity // A bare-bones version of the deck
	DeckIndex           int
	Stacks              []int
	PlayStackDirections []int // The values for this are listed in "constants.go"
	Turn                int   // Starts at 0; the client will represent turn 0 as turn 1 to the user
	DatetimeTurnBegin   time.Time
	TurnsInverted       bool
	ActivePlayerIndex   int // Every game always starts with the 0th player going first
	ClueTokens          int
	Score               int
	MaxScore            int
	Strikes             int
	LastClueTypeGiven   int // Used in "Alternating Clues" variants
	// Actions is a list of all of the in-game moves that players have taken thus far
	// Different actions will have different fields, so we need this to be an generic interface
	// Furthermore, we do not want this to be a pointer of interfaces because
	// this simplifies action scrubbing
	Actions []interface{}
	// DBActions is a database-compatible representation of in-game moves
	// (it is much less verbose when compared with Actions)
	DBActions             []*options.GameAction
	InvalidActionOccurred bool // Used when emulating game actions in replays
	EndCondition          int  // The values for this are listed in "constants.go"
	// The index of the player who ended the game, if any
	// (needed for writing a "game over" terminate action to the database)
	EndPlayer int
	// Initialized to -1 and set when the final card is drawn
	// (to determine when the game should end)
	EndTurn int

	// Time & Pause related fields
	StartedTimer     bool // The timer is only started when the initial player has finished loading
	Paused           bool
	PausePlayerIndex int
	PauseCount       int

	// Shared replay fields
	EfficiencyMod int

	// Hypothetical-related fields
	Hypothetical       bool // Whether or not we are in a post-game hypothetical
	HypoActions        []string
	HypoShowDrawnCards bool // Whether or not drawn cards should be revealed (false by default)

	// Keep track of user-defined tags; they will be written to the database upon game completion
	Tags map[string]int // Keys are the tags, values are the user ID that created it
}

func (m *Manager) newGame(t *table) *game {
	g := &game{
		table:        t,
		options:      t.Options,
		extraOptions: t.ExtraOptions,
		variant:      t.Variant,

		DatetimeStarted:  time.Time{},
		DatetimeFinished: time.Time{},

		Players:               make([]*gamePlayer, 0),
		Seed:                  "",
		Deck:                  make([]*card, 0),
		CardIdentities:        make([]*options.CardIdentity, 0),
		DeckIndex:             0,
		Stacks:                make([]int, len(t.Variant.Suits)),
		PlayStackDirections:   make([]int, len(t.Variant.Suits)),
		Turn:                  0,
		DatetimeTurnBegin:     time.Now(),
		TurnsInverted:         false,
		ActivePlayerIndex:     0,
		ClueTokens:            t.Variant.GetAdjustedClueTokens(constants.MaxClueNum),
		Score:                 0,
		MaxScore:              len(t.Variant.Suits) * constants.PointsPerSuit,
		Strikes:               0,
		LastClueTypeGiven:     -1,
		Actions:               make([]interface{}, 0),
		DBActions:             make([]*options.GameAction, 0),
		InvalidActionOccurred: false,
		EndCondition:          0,
		EndPlayer:             -1,
		EndTurn:               -1,

		StartedTimer:     false,
		Paused:           false,
		PausePlayerIndex: -1,
		PauseCount:       0,

		EfficiencyMod: 0,

		Hypothetical:       false,
		HypoActions:        make([]string, 0),
		HypoShowDrawnCards: false,

		Tags: make(map[string]int),
	}

	// Reverse the stack direction of reversed suits,
	// except on the "Up or Down" variant that uses the "Undecided" direction
	if t.Variant.HasReversedSuits() && !t.Variant.IsUpOrDown() {
		for i, s := range t.Variant.Suits {
			if s.Reversed {
				g.PlayStackDirections[i] = variants.StackDirectionDown
			} else {
				g.PlayStackDirections[i] = variants.StackDirectionUp
			}
		}
	}

	return g
}
