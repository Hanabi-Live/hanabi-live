package main

import (
	"strconv"
	"strings"
	"time"
)

type Game struct {
	// This corresponds to the database ID of the game
	// or 0 if it is an ongoing game that has not been written to the database yet
	ID int

	// This is a reference to the parent object; every game must have a parent Table object
	Table *Table
	// This is a reference to the Options field of the Table object (for convenience purposes)
	Options *Options

	// Game state related fields
	Players []*GamePlayer
	// The seed specifies how the deck is dealt
	// It is either entered manually by players before the game starts or
	// randomly selected by the server upon starting a game
	Seed              string
	Deck              []*Card
	DeckIndex         int
	PossibleCards     map[string]int
	Stacks            []int
	StackDirections   []int // The values for this are listed in "constants.go"
	Turn              int   // Starts at 0; the client will represent turn 0 as turn 1 to the user
	DatetimeTurnBegin time.Time
	TurnsInverted     bool
	ActivePlayer      int
	ClueTokens        int
	Score             int
	MaxScore          int
	Strikes           int
	LastClueTypeGiven int
	// Different actions will have different fields
	// Thus, Actions is a slice of different action types
	// Furthermore, we don't want this to be a pointer of interfaces because
	// this simplifies action scrubbing
	Actions      []interface{}
	EndCondition int // The values for this are listed in "constants.go"
	// Initialized to -1 and set when the final card is drawn
	// (to determine when the game should end)
	EndTurn int

	// Sound-related fields
	// The name of the sound file to play to represent the action taken for the current turn
	Sound      string
	BlindPlays int // The number of consecutive blind plays
	Misplays   int // The number of consecutive misplays

	// Pause-related fields
	// (these are only applicable to timed games)
	Paused      bool
	PauseTime   time.Time
	PauseCount  int
	PausePlayer int // The index of the player who paused

	// Hypothetical-related fields
	Hypothetical bool // Whether or not we are in a post-game hypothetical
	HypoActions  []string
}

func NewGame(t *Table) *Game {
	g := &Game{
		Table:   t,
		Options: t.Options,

		Players:           make([]*GamePlayer, 0),
		Deck:              make([]*Card, 0),
		PossibleCards:     make(map[string]int),
		Stacks:            make([]int, len(variants[t.Options.Variant].Suits)),
		StackDirections:   make([]int, len(variants[t.Options.Variant].Suits)),
		DatetimeTurnBegin: time.Now(),
		ClueTokens:        maxClueNum,
		MaxScore:          len(variants[t.Options.Variant].Suits) * 5,
		LastClueTypeGiven: -1,
		Actions:           make([]interface{}, 0),
		EndTurn:           -1,

		HypoActions: make([]string, 0),
	}

	if strings.HasPrefix(t.Options.Variant, "Clue Starved") {
		// In this variant, having 1 clue token is represented with a value of 2
		// We want the players to start with the normal amount of clues,
		// so we have to double the starting amount
		g.ClueTokens *= 2
	}

	// Also, attach this new Game object to the parent table
	g.Table.Game = g

	return g
}

/*
	Major functions
*/

// CheckTimer is meant to be called in a new goroutine
func (g *Game) CheckTimer(turn int, pauseCount int, p *GamePlayer) {
	t := g.Table

	// Sleep until the active player runs out of time
	time.Sleep(p.Time)
	commandMutex.Lock()
	defer commandMutex.Unlock()

	// Check to see if the game ended already
	if g.EndCondition > endConditionInProgress {
		return
	}

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

	p.Time = 0
	logger.Info(t.GetName() + "Time ran out for \"" + p.Name + "\".")

	// End the game
	ps := t.Players[p.Index].Session
	ps.Set("currentTable", t.ID)
	ps.Set("status", statusPlaying)
	commandAction(ps, &CommandData{
		Type: actionTypeTimeLimitReached,
	})
}

func (g *Game) CheckEnd() bool {
	t := g.Table

	// Check to see if one of the players ran out of time
	if g.EndCondition == endConditionTimeout {
		return true
	}

	// Check to see if the game ended to idleness
	if g.EndCondition == actionTypeIdleLimitReached {
		return true
	}

	// Check for 3 strikes
	if g.Strikes == 3 {
		logger.Info(t.GetName() + "3 strike maximum reached; ending the game.")
		g.EndCondition = endConditionStrikeout
		return true
	}

	// Check to see if the final go-around has completed
	// (which is initiated after the last card is played from the deck)
	if g.Turn == g.EndTurn {
		logger.Info(t.GetName() + "Final turn reached; ending the game.")
		g.EndCondition = endConditionNormal
		return true
	}

	// Check to see if the maximum score has been reached
	if g.Score == g.MaxScore {
		logger.Info(t.GetName() + "Maximum score reached; ending the game.")
		g.EndCondition = endConditionNormal
		return true
	}

	// In a speedrun, check to see if a perfect score can still be achieved
	if g.Options.Speedrun && g.GetMaxScore() < variants[g.Options.Variant].MaxScore {
		g.EndCondition = endConditionSpeedrunFail
		return true
	}

	// Check to see if there are any cards remaining that can be played on the stacks
	if strings.HasPrefix(g.Options.Variant, "Up or Down") {
		// Searching for the next card is much more complicated if we are playing a "Up or Down" variant,
		// so the logic for this is stored in a separate file
		if !variantUpOrDownCheckAllDead(g) {
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
				if c.Suit == neededSuit &&
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
	g.EndCondition = endConditionNormal
	return true
}

/*
	Miscellaneous functions
*/

func (g *Game) GetHandSize() int {
	t := g.Table

	numPlayers := len(g.Players)
	if numPlayers == 2 || numPlayers == 3 {
		return 5
	} else if numPlayers == 4 || numPlayers == 5 {
		return 4
	} else if numPlayers == 6 {
		return 3
	}

	logger.Fatal("Failed to get the hand size for " + strconv.Itoa(numPlayers) +
		" players for game: " + t.Name)
	return -1
}

// GetMaxScore calculates what the maximum score is,
// accounting for stacks that cannot be completed due to discarded cards
func (g *Game) GetMaxScore() int {
	// Getting the maximum score is much more complicated if we are playing a "Up or Down" variant
	if strings.HasPrefix(g.Options.Variant, "Up or Down") {
		return variantUpOrDownGetMaxScore(g)
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
func (g *Game) GetSpecificCardNum(suit int, rank int) (int, int) {
	total := 0
	discarded := 0
	for _, c := range g.Deck {
		if c.Suit == suit && c.Rank == rank {
			total++
			if c.Discarded {
				discarded++
			}
		}
	}

	return total, discarded
}
