package main

import (
	"strings"
	"time"
)

type Game struct {
	ID         int
	Running            bool
	Replay             bool
	DatetimeStarted    time.Time
	DatetimeFinished   time.Time
	EndCondition       int  // See "database_schema.sql" for mappings
        GameSpec           *GameSpec

	Deck            []*Card
	DeckIndex       int
	Stacks          []int
	StackDirections []int // The possible values for this are listed in "constants.go"
	Turn            int   // Starts at 0; the client will represent turn 0 as turn 1 to the user
	TurnsInverted   bool
	ActivePlayer    int
	Clues           int
	Score           int
	MaxScore        int
	Progress        int
	Strikes         int
	// Different actions will have different fields
	// Thus, Actions is a slice of different action types
	// Furthermore, we don'g want this to be a pointer of interfaces because
	// this simplifies action scrubbing
	Actions       []interface{}
	Sound         string
	TurnBeginTime time.Time
	// Set when the final card is drawn to determine when the game should end
	EndTurn     int
	BlindPlays  int                // The number of consecutive blind plays
	Misplays    int                // The number of consecutive misplays
	Paused      bool               // Only applicable to timed tables
	PauseTime   time.Time          // Only applicable to timed tables
	PauseCount  int                // Only applicable to timed tables
	PausePlayer int                // The index of the player who paused

	Hypothetical bool // Whether or not we are in a post-game hypothetical
	HypoActions  []string
}

/*
	Initialization functions
*/

func (g *Game) InitDeck() {
	// Create the deck (the amount of cards will depend on the variant)
	g.Deck = make([]*Card, 0)

	// Suits are represented as a slice of integers from 0 to the number of suits - 1
	// (e.g. {0, 1, 2, 3, 4} for a "No Variant" game)
        var variant = g.GameSpec.Options.Variant;
	for suit := range variants[variant].Suits {
		// Ranks are represented as a slice of integers
		// (e.g. {1, 2, 3, 4, 5} for a "No Variant" game)
		for _, rank := range variants[variant].Ranks {
			// In a normal suit of Hanabi, there are three 1's, two 2's, two 3's, two 4's, and one five
			var amountToAdd int
			if rank == 1 {
				amountToAdd = 3
				if strings.HasPrefix(variant, "Up or Down") {
					amountToAdd = 1
				}
			} else if rank == 5 {
				amountToAdd = 1
			} else if rank == startCardRank {
				amountToAdd = 1
			} else {
				amountToAdd = 2
			}
			if variants[variant].Suits[suit].OneOfEach {
				amountToAdd = 1
			}

			for i := 0; i < amountToAdd; i++ {
				// Add the card to the deck
				g.Deck = append(g.Deck, &Card{
					Suit: suit,
					Rank: rank,
					// We can'g set the order here because the deck will be shuffled later
				})
			}
		}
	}
}

/*
	Miscellaneous functions
*/

// GetMaxScore calculates what the maximum score is,
// accounting for stacks that cannot be completed due to discarded cards
func (g *Game) GetMaxScore() int {
	// Getting the maximum score is much more complicated if we are playing a "Up or Down" variant
	if strings.HasPrefix(g.GameSpec.Options.Variant, "Up or Down") {
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

// GetPerfectScore returns the theoretical perfect score for this variant
// (which assumes that there are 5 points per stack)
func (g *Game) GetPerfectScore() int {
	return len(g.Stacks) * 5
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

func (g *Game) CheckEnd() bool {
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
		//log.Info(g.GetName() + "3 strike maximum reached; ending the game.")
		g.EndCondition = endConditionStrikeout
		return true
	}

	// Check to see if the final go-around has completed
	// (which is initiated after the last card is played from the deck)
	if g.Turn == g.EndTurn {
		//log.Info(g.GetName() + "Final turn reached; ending the game.")
		g.EndCondition = endConditionNormal
		return true
	}

	// Check to see if the maximum score has been reached
	if g.Score == g.MaxScore {
		//log.Info(g.GetName() + "Maximum score reached; ending the game.")
		g.EndCondition = endConditionNormal
		return true
	}

	// In a speedrun, check to see if a perfect score can still be achieved
	if g.GameSpec.Options.Speedrun && g.GetMaxScore() < g.GetPerfectScore() {
		g.EndCondition = endConditionSpeedrunFail
		return true
	}

	// Check to see if there are any cards remaining that can be played on the stacks
	if strings.HasPrefix(g.GameSpec.Options.Variant, "Up or Down") {
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
	// log.Info(g.GetName() + "No remaining cards can be played; ending the game.")
	g.EndCondition = endConditionNormal
	return true
}
