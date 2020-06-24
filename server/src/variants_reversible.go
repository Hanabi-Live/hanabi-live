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
	// Rank 0 is the stack base
	// Rank 1-5 are the normal cards
	// Rank 6 is a card of unknown rank
	// Rank 7 is a "START" card
	StartCardRank = 7
)

func isUpOrDown(g *Game) bool {
	return variants[g.Options.VariantName].IsUpOrDown()
}

func variantReversiblePlay(g *Game, c *Card) bool {
	var failed bool
	if g.StackDirections[c.Suit] == StackDirectionUndecided {
		// If the stack direction is undecided,
		// then there is either no cards played or a "START" card has been played
		if g.Stacks[c.Suit] == 0 {
			// No cards have been played yet on this stack
			failed = c.Rank != 1 && c.Rank != 5 && c.Rank != StartCardRank

			// Set the stack direction
			if !failed {
				if c.Rank == 1 {
					g.StackDirections[c.Suit] = StackDirectionUp
				} else if c.Rank == 5 {
					g.StackDirections[c.Suit] = StackDirectionDown
				}
				// If the "START" card was played, we want to keep the stack direction undecided
			}
		} else if g.Stacks[c.Suit] == StartCardRank {
			// The "START" card has been played on the stack
			failed = c.Rank != 2 && c.Rank != 4

			// Set the stack direction
			if !failed {
				if c.Rank == 2 {
					g.StackDirections[c.Suit] = StackDirectionUp
				} else if c.Rank == 4 {
					g.StackDirections[c.Suit] = StackDirectionDown
				}
			}
		}
	} else if g.StackDirections[c.Suit] == StackDirectionUp {
		failed = c.Rank != g.Stacks[c.Suit]+1

		// Set the stack direction
		if !failed && c.Rank == 5 {
			g.StackDirections[c.Suit] = StackDirectionFinished
		}
	} else if g.StackDirections[c.Suit] == StackDirectionDown {
		if !isUpOrDown(g) && g.Stacks[c.Suit] == 0 {
			// The first card in a down stack must be a 5
			// except on "Up or Down", where the stack direction starts Undecided
			failed = c.Rank != 5
		} else {
			failed = c.Rank != g.Stacks[c.Suit]-1
		}

		// Set the stack direction
		if !failed && c.Rank == 1 {
			g.StackDirections[c.Suit] = StackDirectionFinished
		}
	} else if g.StackDirections[c.Suit] == StackDirectionFinished {
		// Once a stack is finished, any card that is played will fail to play
		failed = true
	}

	return failed
}

// variantReversibleNeedsToBePlayed returns true if this card still needs to be played
// in order to get the maximum score (taking into account the stack direction)
// (before getting here, we already checked to see if the card has already been played)
func variantReversibleNeedsToBePlayed(g *Game, c *Card) bool {
	// First, check to see if the stack is already finished
	if g.StackDirections[c.Suit] == StackDirectionFinished {
		return false
	}

	// Second, check to see if this card is dead
	// (meaning that all of a previous card in the suit have been discarded already)
	if variantReversibleIsDead(g, c) {
		return false
	}

	// This function is only entered for cards that have another copy (e.g. 2's, 3's, and 4's)
	// All 2's, 3's, and 4's must be played
	return true
}

// variantReversibleIsDead returns true if it is no longer possible to play this card by
// looking to see if all of the previous cards in the stack have been discarded
// (taking into account the stack direction)
func variantReversibleIsDead(g *Game, c *Card) bool {
	// Make a map that shows if all of some particular rank in this suit has been discarded
	ranks := []int{1, 2, 3, 4, 5}
	if isUpOrDown(g) {
		ranks = append(ranks, StartCardRank)
	}

	allDiscarded := make(map[int]bool)
	for _, rank := range ranks {
		total, discarded := g.GetSpecificCardNum(c.Suit, rank)
		allDiscarded[rank] = total == discarded
	}

	// Start by handling the easy cases of up and down
	if g.StackDirections[c.Suit] == StackDirectionUp {
		firstRank := 1
		if isUpOrDown(g) {
			// When the direction is up on "Up or Down", the 1 has been played
			firstRank = 2
		}
		for rank := firstRank; rank < c.Rank; rank++ {
			if allDiscarded[rank] {
				return true
			}
		}
		return false
	}
	if g.StackDirections[c.Suit] == StackDirectionDown {
		firstRank := 5
		if isUpOrDown(g) {
			// When the direction is up on "Up or Down", the 5 has been played
			firstRank = 4
		}
		for rank := firstRank; rank > c.Rank; rank-- {
			if allDiscarded[rank] {
				return true
			}
		}
		return false
	}

	// If we got this far, the stack direction is undecided
	// (the previous function handles the case where the stack is finished)
	// Assert and log otherwise
	if !isUpOrDown(g) {
		logger.Error("Unexpected: found an undecided stack in a \"Reversed\" variant game.")
	}

	// Check to see if the entire suit is dead in the case where
	// all 3 of the start cards are discarded
	if allDiscarded[1] && allDiscarded[5] && allDiscarded[StartCardRank] {
		return true
	}

	// If the "START" card is played on the stack,
	// then this card will be dead if all of the 2's and all of the 4's have been discarded
	// (this situation also applies to 3's when no cards have been played on the stack)
	if g.Stacks[c.Suit] == StartCardRank || c.Rank == 3 {
		if allDiscarded[2] && allDiscarded[4] {
			return true
		}
	}

	return false
}

// variantReversibleGetMaxScore calculates what the maximum score is,
// accounting for stacks that cannot be completed due to discarded cards
func variantReversibleGetMaxScore(g *Game) int {
	maxScore := 0
	for suit := range g.Stacks {
		// Make a map that shows if all of some particular rank in this suit has been discarded
		ranks := []int{1, 2, 3, 4, 5}
		if isUpOrDown(g) {
			ranks = append(ranks, StartCardRank)
		}

		allDiscarded := make(map[int]bool)
		for _, rank := range ranks {
			total, discarded := g.GetSpecificCardNum(suit, rank)
			allDiscarded[rank] = total == discarded
		}

		if g.StackDirections[suit] == StackDirectionUndecided {
			upWalk := variantReversibleWalkUp(g, suit, allDiscarded)
			downWalk := variantReversibleWalkDown(g, suit, allDiscarded)
			maxScore += max(upWalk, downWalk)
		} else if g.StackDirections[suit] == StackDirectionUp {
			maxScore += variantReversibleWalkUp(g, suit, allDiscarded)
		} else if g.StackDirections[suit] == StackDirectionDown {
			maxScore += variantReversibleWalkDown(g, suit, allDiscarded)
		} else if g.StackDirections[suit] == StackDirectionFinished {
			maxScore += 5
		}
	}

	return maxScore
}

func variantReversibleWalkUp(g *Game, suit int, allDiscarded map[int]bool) int {
	cardsThatCanStillBePlayed := 0

	// First, check to see if the stack can still be started
	if isUpOrDown(g) {
		if allDiscarded[1] && allDiscarded[StartCardRank] {
			// On "Up or Down", you can start with 1 or Start
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

func variantReversibleWalkDown(g *Game, suit int, allDiscarded map[int]bool) int {
	cardsThatCanStillBePlayed := 0

	// First, check to see if the stack can still be started
	if isUpOrDown(g) {
		if allDiscarded[5] && allDiscarded[StartCardRank] {
			// On "Up or Down", you can start with 5 or Start
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
	for suit, stackRank := range g.Stacks {
		neededRanks := make([]int, 0)
		if g.StackDirections[suit] == StackDirectionUndecided {
			if stackRank == 0 {
				// Nothing is played on the stack
				neededRanks = []int{1, 5, StartCardRank}
			} else if stackRank == StartCardRank {
				// The "START" card is played on the stack
				neededRanks = []int{2, 4}
			}
		} else if g.StackDirections[suit] == StackDirectionUp {
			neededRanks = append(neededRanks, stackRank+1)
		} else if g.StackDirections[suit] == StackDirectionDown {
			if !isUpOrDown(g) && stackRank == 0 {
				// On "Reversed", the Down stacks start with 5
				neededRanks = []int{5}
			} else {
				neededRanks = append(neededRanks, stackRank-1)
			}
		} else if g.StackDirections[suit] == StackDirectionFinished {
			continue
		}

		for _, c := range g.Deck {
			for _, neededRank := range neededRanks {
				if c.Suit == suit &&
					c.Rank == neededRank &&
					!c.Discarded {

					return false
				}
			}
		}
	}

	// If we got this far, nothing can be played
	return true
}
