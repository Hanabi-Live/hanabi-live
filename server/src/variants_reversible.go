// Helper functions for variants where suits have a non-standard playing direction
// (e.g. 5 --> 4 --> 3 --> 2 --> 1)
// Currently used for "Up Or Down" and "Reversed" variants

package main

// iota starts at 0 and counts upwards
// i.e. stackDirectionUndecided = 0, stackDirectionUp = 1, etc.

const (
	StackDirectionUndecided = iota
	StackDirectionUp
	StackDirectionDown
	StackDirectionFinished
)
const (
	// The "Up or Down" variants have "START" cards
	// Rank 0 is the stack base
	// Rank 1-5 are the normal cards
	// Rank 6 is a card of unknown rank
	// Rank 7 is a "START" card
	StartCardRank = 7
)

func variantReversiblePlay(g *Game, c *Card) bool {
	// Local variables
	variant := variants[g.Options.VariantName]

	var failed bool
	if g.PlayStackDirections[c.SuitIndex] == StackDirectionUndecided {
		// If the stack direction is undecided,
		// then there is either no cards played or a "START" card has been played
		if g.Stacks[c.SuitIndex] == 0 {
			// No cards have been played yet on this stack
			failed = c.Rank != 1 && c.Rank != 5 && c.Rank != StartCardRank

			// Set the stack direction
			if !failed {
				if c.Rank == 1 {
					g.PlayStackDirections[c.SuitIndex] = StackDirectionUp
				} else if c.Rank == 5 {
					g.PlayStackDirections[c.SuitIndex] = StackDirectionDown
				}
				// If the "START" card was played, we want to keep the stack direction undecided
			}
		} else if g.Stacks[c.SuitIndex] == StartCardRank {
			// The "START" card has been played on the stack
			failed = c.Rank != 2 && c.Rank != 4

			// Set the stack direction
			if !failed {
				if c.Rank == 2 {
					g.PlayStackDirections[c.SuitIndex] = StackDirectionUp
				} else if c.Rank == 4 {
					g.PlayStackDirections[c.SuitIndex] = StackDirectionDown
				}
			}
		}
	} else if g.PlayStackDirections[c.SuitIndex] == StackDirectionUp {
		failed = c.Rank != g.Stacks[c.SuitIndex]+1

		// Set the stack direction
		if !failed && c.Rank == 5 {
			g.PlayStackDirections[c.SuitIndex] = StackDirectionFinished
		}
	} else if g.PlayStackDirections[c.SuitIndex] == StackDirectionDown {
		if !variant.IsUpOrDown() && g.Stacks[c.SuitIndex] == 0 {
			// The first card in a down stack must be a 5
			// except on "Up or Down", where the stack direction starts Undecided
			failed = c.Rank != 5
		} else {
			failed = c.Rank != g.Stacks[c.SuitIndex]-1
		}

		// Set the stack direction
		if !failed && c.Rank == 1 {
			g.PlayStackDirections[c.SuitIndex] = StackDirectionFinished
		}
	} else if g.PlayStackDirections[c.SuitIndex] == StackDirectionFinished {
		// Once a stack is finished, any card that is played will fail to play
		failed = true
	}

	return failed
}

// variantReversibleGetMaxScore calculates what the maximum score is,
// accounting for stacks that cannot be completed due to discarded cards
func variantReversibleGetMaxScore(g *Game) int {
	// Local variables
	variant := variants[g.Options.VariantName]

	maxScore := 0
	for suitIndex := range g.Stacks {
		// Make a map that shows if all of some particular rank in this suit has been discarded
		ranks := []int{1, 2, 3, 4, 5}
		if variant.IsUpOrDown() {
			ranks = append(ranks, StartCardRank)
		}

		allDiscarded := make(map[int]bool)
		for _, rank := range ranks {
			total, discarded := g.GetSpecificCardNum(suitIndex, rank)
			allDiscarded[rank] = total == discarded
		}

		if g.PlayStackDirections[suitIndex] == StackDirectionUndecided {
			upWalk := variantReversibleWalkUp(g, allDiscarded)
			downWalk := variantReversibleWalkDown(g, allDiscarded)
			maxScore += max(upWalk, downWalk)
		} else if g.PlayStackDirections[suitIndex] == StackDirectionUp {
			maxScore += variantReversibleWalkUp(g, allDiscarded)
		} else if g.PlayStackDirections[suitIndex] == StackDirectionDown {
			maxScore += variantReversibleWalkDown(g, allDiscarded)
		} else if g.PlayStackDirections[suitIndex] == StackDirectionFinished {
			maxScore += 5
		}
	}

	return maxScore
}

// A helper function for "variantReversibleGetMaxScore()"
func variantReversibleWalkUp(g *Game, allDiscarded map[int]bool) int {
	// Local variables
	variant := variants[g.Options.VariantName]

	cardsThatCanStillBePlayed := 0

	// First, check to see if the stack can still be started
	if variant.IsUpOrDown() {
		if allDiscarded[1] && allDiscarded[StartCardRank] {
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

// A helper function for "variantReversibleGetMaxScore()"
func variantReversibleWalkDown(g *Game, allDiscarded map[int]bool) int {
	// Local variables
	variant := variants[g.Options.VariantName]

	cardsThatCanStillBePlayed := 0

	// First, check to see if the stack can still be started
	if variant.IsUpOrDown() {
		if allDiscarded[5] && allDiscarded[StartCardRank] {
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

// variantReversibleCheckAllDead returns true if no more cards can be played on the stacks
func variantReversibleCheckAllDead(g *Game) bool {
	// Local variables
	variant := variants[g.Options.VariantName]

	for suitIndex, stackRank := range g.Stacks {
		neededRanks := make([]int, 0)
		if g.PlayStackDirections[suitIndex] == StackDirectionUndecided {
			if stackRank == 0 {
				// Nothing is played on the stack
				neededRanks = []int{1, 5, StartCardRank}
			} else if stackRank == StartCardRank {
				// The "START" card is played on the stack
				neededRanks = []int{2, 4}
			}
		} else if g.PlayStackDirections[suitIndex] == StackDirectionUp {
			neededRanks = append(neededRanks, stackRank+1)
		} else if g.PlayStackDirections[suitIndex] == StackDirectionDown {
			if !variant.IsUpOrDown() && stackRank == 0 {
				// On "Reversed", the Down stacks start with 5
				neededRanks = []int{5}
			} else {
				neededRanks = append(neededRanks, stackRank-1)
			}
		} else if g.PlayStackDirections[suitIndex] == StackDirectionFinished {
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
