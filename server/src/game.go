package main

import (
	"strconv"
	"time"
)

// Game is a sub-object of a table
// It represents all of the particular state associated with a game
// A tag of `json:"-"` denotes that the JSON serializer should skip the field when serializing
// (which is used in this case to prevent circular references)
type Game struct {
	// This corresponds to the database field of "datetime_started"
	// It will be equal to "Table.DatetimeStarted" in an ongoing game that has not been written to
	// the database yet
	DatetimeStarted time.Time

	// This corresponds to the database field of "datetime_finished"
	// It will be blank in an ongoing game that has not been written to the database yet
	DatetimeFinished time.Time

	// This is a reference to the parent object; every game must have a parent Table object
	Table *Table `json:"-"`
	// This is a reference to the Options field of the Table object (for convenience purposes)
	Options      *Options      `json:"-"`
	ExtraOptions *ExtraOptions `json:"-"`
	// (circular references must also be restored in the "restoreTables()" function)

	// Game state related fields
	Players []*GamePlayer
	// The seed specifies how the deck is dealt
	// It is either entered manually by players before the game starts or
	// randomly selected by the server upon starting a game
	Seed                string
	Deck                []*Card
	CardIdentities      []*CardIdentity // A bare-bones version of the deck
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
	// In the future, we will just send Actions2 to the client and delete Actions
	Actions []interface{}
	// Actions2 is a database-compatible representation of in-game moves
	// (it is much less verbose when compared with Actions)
	Actions2              []*GameAction
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
	Hypothetical        bool // Whether or not we are in a post-game hypothetical
	HypoActions         []string
	HypoDrawnCardsShown bool // Whether or not drawn cards should be revealed (false by default)

	// Keep track of user-defined tags; they will be written to the database upon game completion
	Tags map[string]int // Keys are the tags, values are the user ID that created it
}

func NewGame(t *Table) *Game {
	variant := variants[t.Options.VariantName]

	g := &Game{
		Table:        t,
		Options:      t.Options,
		ExtraOptions: t.ExtraOptions,

		Players:             make([]*GamePlayer, 0),
		Deck:                make([]*Card, 0),
		CardIdentities:      make([]*CardIdentity, 0),
		Stacks:              make([]int, len(variant.Suits)),
		PlayStackDirections: make([]int, len(variant.Suits)),
		DatetimeTurnBegin:   time.Now(),
		ClueTokens:          variant.GetAdjustedClueTokens(MaxClueNum),
		MaxScore:            len(variant.Suits) * PointsPerSuit,
		LastClueTypeGiven:   -1,
		Actions:             make([]interface{}, 0),
		Actions2:            make([]*GameAction, 0),
		EndTurn:             -1,

		HypoActions: make([]string, 0),
		Tags:        make(map[string]int),
	}

	// Reverse the stack direction of reversed suits, except on the "Up or Down" variant
	// that uses the "Undecided" direction.
	if variant.HasReversedSuits() && !variant.IsUpOrDown() {
		for i, s := range variant.Suits {
			if s.Reversed {
				g.PlayStackDirections[i] = StackDirectionDown
			} else {
				g.PlayStackDirections[i] = StackDirectionUp
			}
		}
	}

	// Also, attach this new Game object to the parent table
	g.Table.Game = g

	return g
}

/*
	Major functions
*/

// CheckTimer is meant to be called in a new goroutine
func (g *Game) CheckTimer(turn int, pauseCount int, gp *GamePlayer) {
	// Local variables
	t := g.Table

	// Sleep until the active player runs out of time
	time.Sleep(gp.Time)

	// Check to see if the table still exists
	t2, exists := getTableAndLock(nil, t.ID, false)
	if !exists || t != t2 {
		return
	}
	t.Mutex.Lock()
	defer t.Mutex.Unlock()

	// Check to see if we have made a move in the meanwhile
	if turn != g.Turn {
		return
	}

	// Check to see if the game is currently paused
	if g.Paused {
		return
	}

	// Check to see if the game was paused while we were sleeping
	if pauseCount != g.PauseCount {
		return
	}

	// Check to see if the game ended already
	if g.EndCondition > EndConditionInProgress {
		return
	}

	g.EndTimer(gp)
}

// EndTimer is called when a player has run out of time in a timed game, which will automatically
// end the game with a score of 0
func (g *Game) EndTimer(gp *GamePlayer) {
	// Local variables
	t := g.Table

	logger.Info(t.GetName() + "Time ran out for \"" + gp.Name + "\".")

	// Adjust the final player's time (for the purposes of displaying the correct ending times)
	gp.Time = 0

	// Get the session of this player
	p := t.Players[gp.Index]
	s := p.Session
	if s == nil {
		// A player's session should never be nil
		// They might be in the process of reconnecting,
		// so make a fake session that will represent them
		s = NewFakeSession(p.ID, p.Name)
		logger.Info("Created a new fake session in the \"CheckTimer()\" function.")
	}

	// End the game
	commandAction(s, &CommandData{ // Manual invocation
		TableID: t.ID,
		Type:    ActionTypeEndGame,
		Target:  gp.Index,
		Value:   EndConditionTimeout,
		NoLock:  true,
	})
}

// CheckEnd examines the game state and sets "EndCondition" to the appropriate value, if any
func (g *Game) CheckEnd() bool {
	// Local variables
	t := g.Table
	variant := variants[g.Options.VariantName]

	// Some ending conditions will already be set by the time we get here
	if g.EndCondition == EndConditionTimeout ||
		g.EndCondition == EndConditionTerminated ||
		g.EndCondition == EndConditionIdleTimeout ||
		g.EndCondition == EndConditionCharacterSoftlock {

		return true
	}

	// Check for 3 strikes
	if g.Strikes == MaxStrikeNum {
		logger.Info(t.GetName() + "3 strike maximum reached; ending the game.")
		g.EndCondition = EndConditionStrikeout
		return true
	}

	// In a speedrun, check to see if a perfect score can still be achieved
	if g.Options.Speedrun && g.MaxScore < variant.MaxScore {
		logger.Info(t.GetName() + "A perfect score is impossible in a speedrun; ending the game.")
		g.EndCondition = EndConditionSpeedrunFail
		return true
	}

	// In an "All or Nothing" game, check to see if a maximum score can still be reached
	if g.Options.AllOrNothing && g.MaxScore < variant.MaxScore {
		logger.Info(t.GetName() + "A perfect score is impossible in an \"All or Nothing\" game; ending the game.")
		g.EndCondition = EndConditionAllOrNothingFail
		return true
	}

	// In an "All or Nothing game",
	// handle the case where a player would have to discard without any cards in their hand
	if g.Options.AllOrNothing &&
		len(g.Players[g.ActivePlayerIndex].Hand) == 0 &&
		g.ClueTokens < variant.GetAdjustedClueTokens(1) {

		logger.Info(t.GetName() + "The current player has no cards and no clue tokens in an \"All or Nothing\" game; ending the game.")
		g.EndCondition = EndConditionAllOrNothingSoftlock
		g.EndPlayer = g.Players[g.ActivePlayerIndex].Index
		return true
	}

	// Check to see if the final go-around has completed
	// (which is initiated after the last card is played from the deck)
	if g.Turn == g.EndTurn {
		logger.Info(t.GetName() + "Final turn reached; ending the game.")
		g.EndCondition = EndConditionNormal
		return true
	}

	// Check to see if the maximum score has been reached
	if g.Score == g.MaxScore {
		logger.Info(t.GetName() + "Maximum score reached; ending the game.")
		g.EndCondition = EndConditionNormal
		return true
	}

	// Check to see if there are any cards remaining that can be played on the stacks
	if variant.HasReversedSuits() {
		// Searching for the next card is much more complicated if we are playing an "Up or Down"
		// or "Reversed" variant, so the logic for this is stored in a separate file
		if !variantReversibleCheckAllDead(g) {
			return false
		}
	} else {
		for i, stackLen := range g.Stacks {
			// Search through the deck
			if stackLen == 5 {
				continue
			}
			neededSuit := i
			neededRank := stackLen + 1
			for _, c := range g.Deck {
				if c.SuitIndex == neededSuit &&
					c.Rank == neededRank &&
					!c.Discarded &&
					!c.CannotBePlayed {

					return false
				}
			}
		}
	}

	// If we got this far, nothing can be played
	logger.Info(t.GetName() + "No remaining cards can be played; ending the game.")
	g.EndCondition = EndConditionNormal
	return true
}

/*
	Miscellaneous functions
*/

func (g *Game) GetHandSize() int {
	handSize := g.GetHandSizeForNormalGame()
	if g.Options.OneExtraCard {
		handSize++
	}
	if g.Options.OneLessCard {
		handSize--
	}
	return handSize
}

func (g *Game) GetHandSizeForNormalGame() int {
	// Local variables
	t := g.Table
	numPlayers := len(g.Players)

	if numPlayers == 2 || numPlayers == 3 {
		return 5
	} else if numPlayers == 4 || numPlayers == 5 {
		return 4
	} else if numPlayers == 6 {
		return 3
	}

	logger.Error("Failed to get the hand size for " + strconv.Itoa(numPlayers) +
		" players for game: " + t.Name)
	return 4
}

// GetMaxScore calculates what the maximum score is,
// accounting for stacks that cannot be completed due to discarded cards
func (g *Game) GetMaxScore() int {
	// Local variables
	variant := variants[g.Options.VariantName]

	// Getting the maximum score is much more complicated if we are playing a
	// "Reversed" or "Up or Down" variant
	if variant.HasReversedSuits() {
		return variantReversibleGetMaxScore(g)
	}

	maxScore := 0
	for suit := range g.Stacks {
		for rank := 1; rank <= 5; rank++ {
			// Search through the deck to see if all the copies of this card are discarded already
			total, discarded := g.GetSpecificCardNum(suit, rank)
			if total > discarded {
				maxScore++
			} else {
				break
			}
		}
	}

	return maxScore
}

// GetSpecificCardNum returns the total cards in the deck of the specified suit and rank
// as well as how many of those that have been already discarded
func (g *Game) GetSpecificCardNum(suitIndex int, rank int) (int, int) {
	total := 0
	discarded := 0
	for _, c := range g.Deck {
		if c.SuitIndex == suitIndex && c.Rank == rank {
			total++
			if c.Discarded {
				discarded++
			}
		}
	}

	return total, discarded
}

func (g *Game) GetNotesSize() int {
	// Local variables
	variant := variants[g.Options.VariantName]

	// There are notes for every card in the deck + the stack bases for each suit
	numCards := len(g.Deck)
	numSuits := len(variant.Suits)
	return numCards + numSuits
}
