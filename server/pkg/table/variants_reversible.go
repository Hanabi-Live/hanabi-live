package table

import (
	"github.com/Zamiell/hanabi-live/server/pkg/util"
	"github.com/Zamiell/hanabi-live/server/pkg/variants"
)

// This file contains helper functions for variants where suits have a reverse playing direction
// (e.g. 5 --> 4 --> 3 --> 2 --> 1)
// Currently, this is the "Up Or Down" and "Reversed" variants

func variantReversiblePlay(g *game, c *card) bool {
	// Local variables
	t := g.table

	var failed bool
	if g.PlayStackDirections[c.SuitIndex] == variants.StackDirectionUndecided {
		// If the stack direction is undecided,
		// then there is either no cards played or a "START" card has been played
		if g.Stacks[c.SuitIndex] == 0 {
			// No cards have been played yet on this stack
			failed = c.Rank != 1 && c.Rank != 5 && c.Rank != variants.StartCardRank

			// Set the stack direction
			if !failed {
				if c.Rank == 1 {
					g.PlayStackDirections[c.SuitIndex] = variants.StackDirectionUp
				} else if c.Rank == 5 { // nolint: gomnd
					g.PlayStackDirections[c.SuitIndex] = variants.StackDirectionDown
				}
				// If the "START" card was played, we want to keep the stack direction undecided
			}
		} else if g.Stacks[c.SuitIndex] == variants.StartCardRank {
			// The "START" card has been played on the stack
			failed = c.Rank != 2 && c.Rank != 4 // nolint: gomnd

			// Set the stack direction
			if !failed {
				if c.Rank == 2 { // nolint: gomnd
					g.PlayStackDirections[c.SuitIndex] = variants.StackDirectionUp
				} else if c.Rank == 4 { // nolint: gomnd
					g.PlayStackDirections[c.SuitIndex] = variants.StackDirectionDown
				}
			}
		}
	} else if g.PlayStackDirections[c.SuitIndex] == variants.StackDirectionUp {
		failed = c.Rank != g.Stacks[c.SuitIndex]+1

		// Set the stack direction
		if !failed && c.Rank == 5 {
			g.PlayStackDirections[c.SuitIndex] = variants.StackDirectionFinished
		}
	} else if g.PlayStackDirections[c.SuitIndex] == variants.StackDirectionDown {
		if !t.Variant.IsUpOrDown() && g.Stacks[c.SuitIndex] == 0 {
			// The first card in a down stack must be a 5
			// except on "Up or Down", where the stack direction starts Undecided
			failed = c.Rank != 5 // nolint: gomnd
		} else {
			failed = c.Rank != g.Stacks[c.SuitIndex]-1
		}

		// Set the stack direction
		if !failed && c.Rank == 1 {
			g.PlayStackDirections[c.SuitIndex] = variants.StackDirectionFinished
		}
	} else if g.PlayStackDirections[c.SuitIndex] == variants.StackDirectionFinished {
		// Once a stack is finished, any card that is played will fail to play
		failed = true
	}

	return failed
}

// variantReversibleGetMaxScore calculates what the maximum score is,
// accounting for stacks that cannot be completed due to discarded cards.
func variantReversibleGetMaxScore(g *game) int {
	// Local variables
	t := g.table

	maxScore := 0
	for suitIndex := range g.Stacks {
		// Make a map that shows if all of some particular rank in this suit has been discarded
		ranks := []int{1, 2, 3, 4, 5}
		if t.Variant.IsUpOrDown() {
			ranks = append(ranks, variants.StartCardRank)
		}

		allDiscarded := make(map[int]bool)
		for _, rank := range ranks {
			total, discarded := g.getSpecificCardNum(suitIndex, rank)
			allDiscarded[rank] = total == discarded
		}

		if g.PlayStackDirections[suitIndex] == variants.StackDirectionUndecided {
			upWalk := variantReversibleWalkUp(g, allDiscarded)
			downWalk := variantReversibleWalkDown(g, allDiscarded)
			maxScore += util.Max(upWalk, downWalk)
		} else if g.PlayStackDirections[suitIndex] == variants.StackDirectionUp {
			maxScore += variantReversibleWalkUp(g, allDiscarded)
		} else if g.PlayStackDirections[suitIndex] == variants.StackDirectionDown {
			maxScore += variantReversibleWalkDown(g, allDiscarded)
		} else if g.PlayStackDirections[suitIndex] == variants.StackDirectionFinished {
			maxScore += 5
		}
	}

	return maxScore
}

// variantReversibleWalkUp is a helper function for "variantReversibleGetMaxScore()".
func variantReversibleWalkUp(g *game, allDiscarded map[int]bool) int {
	// Local variables
	t := g.table

	cardsThatCanStillBePlayed := 0

	// First, check to see if the stack can still be started
	if t.Variant.IsUpOrDown() {
		if allDiscarded[1] && allDiscarded[variants.StartCardRank] {
			// In "Up or Down" variants, you can start with 1 or START when going up
			return 0
		}
	} else {
		if allDiscarded[1] {
			// Otherwise, only 1
			return 0
		}
	}
	cardsThatCanStillBePlayed++

	// Second, walk upwards
	for rank := 2; rank <= 5; rank++ {
		if allDiscarded[rank] {
			break
		}
		cardsThatCanStillBePlayed++
	}

	return cardsThatCanStillBePlayed
}

// variantReversibleWalkDown is a helper function for "variantReversibleGetMaxScore()".
func variantReversibleWalkDown(g *game, allDiscarded map[int]bool) int {
	// Local variables
	t := g.table

	cardsThatCanStillBePlayed := 0

	// First, check to see if the stack can still be started
	if t.Variant.IsUpOrDown() {
		if allDiscarded[5] && allDiscarded[variants.StartCardRank] {
			// In "Up or Down" variants, you can start with 5 or START when going down
			return 0
		}
	} else {
		if allDiscarded[5] {
			// Otherwise, only 5
			return 0
		}
	}
	cardsThatCanStillBePlayed++

	// Second, walk downwards
	for rank := 4; rank >= 1; rank-- {
		if allDiscarded[rank] {
			break
		}
		cardsThatCanStillBePlayed++
	}

	return cardsThatCanStillBePlayed
}

// variantReversibleCheckAllDead returns true if no more cards can be played on the stacks.
func variantReversibleCheckAllDead(g *game) bool {
	// Local variables
	t := g.table

	for suitIndex, stackRank := range g.Stacks {
		neededRanks := make([]int, 0)
		if g.PlayStackDirections[suitIndex] == variants.StackDirectionUndecided {
			if stackRank == 0 {
				// Nothing is played on the stack
				neededRanks = []int{1, 5, variants.StartCardRank}
			} else if stackRank == variants.StartCardRank {
				// The "START" card is played on the stack
				neededRanks = []int{2, 4}
			}
		} else if g.PlayStackDirections[suitIndex] == variants.StackDirectionUp {
			neededRanks = append(neededRanks, stackRank+1)
		} else if g.PlayStackDirections[suitIndex] == variants.StackDirectionDown {
			if !t.Variant.IsUpOrDown() && stackRank == 0 {
				// On "Reversed", the Down stacks start with 5
				neededRanks = []int{5}
			} else {
				neededRanks = append(neededRanks, stackRank-1)
			}
		} else if g.PlayStackDirections[suitIndex] == variants.StackDirectionFinished {
			continue
		}

		for _, c := range g.Deck {
			for _, neededRank := range neededRanks {
				if c.SuitIndex == suitIndex &&
					c.Rank == neededRank &&
					!c.Discarded &&
					!c.CannotBePlayed {

					return false
				}
			}
		}
	}

	// If we got this far, nothing can be played
	return true
}
