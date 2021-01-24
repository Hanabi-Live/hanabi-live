package table

import (
	"github.com/Zamiell/hanabi-live/server/pkg/constants"
	"github.com/Zamiell/hanabi-live/server/pkg/types"
	"github.com/Zamiell/hanabi-live/server/pkg/util"
	"github.com/Zamiell/hanabi-live/server/pkg/variants"
)

// GetMaxScore calculates what the maximum score is, accounting for stacks that cannot be completed
// due to discarded cards.
func (g *game) getMaxScore() int {
	// Local variables
	t := g.table

	// Getting the maximum score is much more complicated if we are playing a
	// "Reversed" or "Up or Down" variant
	if t.Variant.HasReversedSuits() {
		return variantReversibleGetMaxScore(g)
	}

	maxScore := 0
	for suit := range g.Stacks {
		for rank := 1; rank <= 5; rank++ {
			// Search through the deck to see if all the copies of this card are discarded already
			total, discarded := g.getSpecificCardNum(suit, rank)
			if total > discarded {
				maxScore++
			} else {
				break
			}
		}
	}

	return maxScore
}

func (g *game) getNotesSize() int {
	// Local variables
	t := g.table

	// There are notes for every card in the deck + the stack bases for each suit
	numCards := len(g.Deck)
	numSuits := len(t.Variant.Suits)

	return numCards + numSuits
}

// getSpecificCardNum returns the total cards in the deck of the specified suit and rank.
// It also returns how many of those that have been already discarded.
func (g *game) getSpecificCardNum(suitIndex int, rank int) (int, int) {
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

// touchesCard returns true if a clue will touch a particular suit.
// For example, a yellow clue will not touch a green card in a normal game,
// but it will the "Dual-Color" variant.
// This mirrors the client function "touchesCard()" in "clues.ts".
func (g *game) touchesCard(clue *types.Clue, c *card) bool {
	// Local variables
	t := g.table
	suit := t.Variant.Suits[c.SuitIndex]

	if clue.Type == constants.ClueTypeColor {
		if t.Variant.ColorCluesTouchNothing {
			return false
		}

		if suit.AllClueColors {
			return true
		}
		if suit.NoClueColors {
			return false
		}

		if t.Variant.SpecialRank == c.Rank {
			if t.Variant.SpecialAllClueColors {
				return true
			}
			if t.Variant.SpecialNoClueColors {
				return false
			}
		}

		clueColorName := t.Variant.ClueColors[clue.Value]

		if suit.Prism {
			// The color that touches a prism card is contingent upon the card's rank
			prismColorIndex := (c.Rank - 1) % len(t.Variant.ClueColors)
			if c.Rank == variants.StartCardRank {
				// "START" cards count as rank 0, so they are touched by the final color
				prismColorIndex = len(t.Variant.ClueColors) - 1
			}
			prismColorName := t.Variant.ClueColors[prismColorIndex]
			return clueColorName == prismColorName
		}

		return util.StringInSlice(clueColorName, suit.ClueColors)
	}

	if clue.Type == constants.ClueTypeRank {
		if t.Variant.RankCluesTouchNothing {
			return false
		}

		if t.Variant.Suits[c.SuitIndex].AllClueRanks {
			return true
		}
		if t.Variant.Suits[c.SuitIndex].NoClueRanks {
			return false
		}

		if t.Variant.SpecialRank == c.Rank {
			if t.Variant.SpecialAllClueRanks {
				return true
			}
			if t.Variant.SpecialNoClueRanks {
				return false
			}
			if t.Variant.SpecialDeceptive {
				// The rank that touches a deceptive card is contingent upon the card's suit
				deceptiveRank := t.Variant.ClueRanks[c.SuitIndex%len(t.Variant.ClueRanks)]
				return clue.Value == deceptiveRank
			}
		}

		return clue.Value == c.Rank
	}

	return false
}

/*

// CheckTimer is meant to be called in a new goroutine
func (g *Game) CheckTimer(
	ctx context.Context,
	timeToSleep time.Duration,
	turn int,
	pauseCount int,
	gp *GamePlayer,
) {
	// Sleep until the active player runs out of time
	time.Sleep(timeToSleep)

	// Local variables
	t := g.Table

	// Check to see if the table still exists
	t2, exists := getTableAndLock(ctx, nil, t.ID, false, true)
	if !exists || t != t2 {
		return
	}
	t.Lock(ctx)
	defer t.Unlock(ctx)

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
	if g.EndCondition > constants.EndConditionInProgress {
		return
	}

	g.EndTimer(ctx, gp)
}

// EndTimer is called when a player has run out of time in a timed game, which will automatically
// end the game with a score of 0
// The table lock is assumed to be acquired in this function
func (g *Game) EndTimer(ctx context.Context, gp *GamePlayer) {
	// Local variables
	t := g.Table

	m.logger.Infof("%v Time ran out for: %v", t.GetName(), gp.Name)

	// Adjust the final player's time (for the purposes of displaying the correct ending times)
	gp.Time = 0

	// Get the session of this player
	p := t.Players[gp.Index]
	s := p.Session
	if s == nil {
		// A player's session should never be nil
		// They might be in the process of reconnecting,
		// so make a fake session that will represent them
		s = NewFakeSession(p.UserID, p.Name)
		hLog.Info("Created a new fake session.")
	}

	// End the game
	commandAction(ctx, s, &CommandData{ // nolint: exhaustivestruct
		TableID:     t.ID,
		Type:        ActionTypeEndGame,
		Target:      gp.Index,
		Value:       EndConditionTimeout,
		NoTableLock: true,
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
		hLog.Infof("%v 3 strike maximum reached; ending the game.", t.GetName())
		g.EndCondition = EndConditionStrikeout
		return true
	}

	// In a speedrun, check to see if a perfect score can still be achieved
	if g.Options.Speedrun && g.MaxScore < variant.MaxScore {
		hLog.Infof("%v A perfect score is impossible in a speedrun; ending the game.", t.GetName())
		g.EndCondition = EndConditionSpeedrunFail
		return true
	}

	// In an "All or Nothing" game, check to see if a maximum score can still be reached
	if g.Options.AllOrNothing && g.MaxScore < variant.MaxScore {
		hLog.Infof(
			"%v A perfect score is impossible in an \"All or Nothing\" game; ending the game.",
			t.GetName(),
		)
		g.EndCondition = EndConditionAllOrNothingFail
		return true
	}

	// In an "All or Nothing game",
	// handle the case where a player would have to discard without any cards in their hand
	if g.Options.AllOrNothing &&
		len(g.Players[g.ActivePlayerIndex].Hand) == 0 &&
		g.ClueTokens < variant.GetAdjustedClueTokens(1) {

		hLog.Infof(
			"%v The current player has no cards and no clue tokens in an \"All or Nothing\" game; ending the game.",
			t.GetName(),
		)
		g.EndCondition = EndConditionAllOrNothingSoftlock
		g.EndPlayer = g.Players[g.ActivePlayerIndex].Index
		return true
	}

	// Check to see if the final go-around has completed
	// (which is initiated after the last card is played from the deck)
	if g.Turn == g.EndTurn {
		hLog.Infof("%v Final turn reached; ending the game.", t.GetName())
		g.EndCondition = EndConditionNormal
		return true
	}

	// Check to see if the maximum score has been reached
	if g.Score == g.MaxScore {
		hLog.Infof("%v Maximum score reached; ending the game.", t.GetName())
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
	hLog.Infof("%v No remaining cards can be played; ending the game.", t.GetName())
	g.EndCondition = EndConditionNormal
	return true
}

*/

// -----------------------
// Miscellaneous functions
// -----------------------

/*

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

	hLog.Errorf("Failed to get the hand size for %v players for table: %v", numPlayers, t.Name)
	return 4
}

*/
