/*
	Functions for the "Up or Down" variants
*/

package main

const (
	stackDirectionUndecided = iota
	stackDirectionUp
	stackDirectionDown
	stackDirectionFinished
)
const (
	// Rank 0 is the stack base
	// Rank 1-5 are the normal cards
	// Rank 6 is a card of unknown rank
	// Rank 7 is a "START" card
	startCardRank = 7
)

func variantUpOrDownPlay(g *Game, c *Card) bool {
	var failed bool
	if g.StackDirections[c.Suit] == stackDirectionUndecided {
		// If the stack direction is undecided,
		// then there is either no cards played or a "START" card has been played
		if g.Stacks[c.Suit] == 0 {
			// No cards have been played yet on this stack
			failed = c.Rank != 1 && c.Rank != 5 && c.Rank != startCardRank

			// Set the stack direction
			if !failed {
				if c.Rank == 1 {
					g.StackDirections[c.Suit] = stackDirectionUp
				} else if c.Rank == 5 {
					g.StackDirections[c.Suit] = stackDirectionDown
				}
				// If the "START" card was played, we want to keep the stack direction undecided
			}

		} else if g.Stacks[c.Suit] == startCardRank {
			// The "START" card has been played
			failed = c.Rank != 2 && c.Rank != 4

			// Set the stack direction
			if !failed {
				if c.Rank == 2 {
					g.StackDirections[c.Suit] = stackDirectionUp
				} else if c.Rank == 4 {
					g.StackDirections[c.Suit] = stackDirectionDown
				}
			}
		}

	} else if g.StackDirections[c.Suit] == stackDirectionUp {
		failed = c.Rank != g.Stacks[c.Suit]+1

		// Set the stack direction
		if !failed && c.Rank == 5 {
			g.StackDirections[c.Suit] = stackDirectionFinished
		}

	} else if g.StackDirections[c.Suit] == stackDirectionDown {
		failed = c.Rank != g.Stacks[c.Suit]-1

		// Set the stack direction
		if !failed && c.Rank == 1 {
			g.StackDirections[c.Suit] = stackDirectionFinished
		}

	} else if g.StackDirections[c.Suit] == stackDirectionFinished {
		// Once a stack is finished, any card that is played will fail to play
		failed = true
	}

	return failed
}

// variantUpOrDownNeedsToBePlayed returns true if this card still needs to be played
// in order to get the maximum score (taking into account the stack direction)
// (before getting here, we already checked to see if the card has already been played)
func variantUpOrDownNeedsToBePlayed(g *Game, c *Card) bool {
	// First, check to see if the suit is already finished
	if g.StackDirections[c.Suit] == stackDirectionFinished {
		return false
	}

	// Second, check to see if this card is dead
	// (meaning that all of a previous card in the suit have been discarded already)
	if variantUpOrDownIsDead(g, c) {
		return false
	}

	// To start with, all 2's, 3's, and 4's must be played
	if c.Rank == 2 || c.Rank == 3 || c.Rank == 4 {
		return true
	}

	// 1's, 5's, and "START" cards do not necessarily need to be played
	if c.Rank == 1 {
		if g.StackDirections[c.Suit] == stackDirectionUndecided {
			if g.Stacks[c.Suit] == 0 {
				// We only need to play a 1 if
				// the 5 and the "START" card of this suit are already discarded
				ranksToCheck := []int{1, startCardRank}
				for i := range ranksToCheck {
					total, discarded := g.GetSpecificCardNum(c.Suit, i)
					if total != discarded {
						return false
					}
				}
				return true
			} else if g.Stacks[c.Suit] == startCardRank {
				// We need to play a 1 if the 5 has already been discarded
				total, discarded := g.GetSpecificCardNum(c.Suit, 5)
				return total == discarded
			}
		} else if g.StackDirections[c.Suit] == stackDirectionUp {
			// We never need to play a 1 if the stack is going up
			return false
		} else if g.StackDirections[c.Suit] == stackDirectionDown {
			// We always need to play a 1 if the stack is going down
			return true
		}

	} else if c.Rank == 5 {
		if g.StackDirections[c.Suit] == stackDirectionUndecided {
			if g.Stacks[c.Suit] == 0 {
				// We only need to play a 5 if
				// the 1 and the "START" card of this suit are already discarded
				ranksToCheck := []int{1, startCardRank}
				for i := range ranksToCheck {
					total, discarded := g.GetSpecificCardNum(c.Suit, i)
					if total != discarded {
						return false
					}
				}
				return true
			} else if g.Stacks[c.Suit] == startCardRank {
				// We need to play a 5 if the 1 has already been discarded
				total, discarded := g.GetSpecificCardNum(c.Suit, 1)
				return total == discarded
			}
		} else if g.StackDirections[c.Suit] == stackDirectionUp {
			// We always need to play a 5 if the stack is going up
			return true
		} else if g.StackDirections[c.Suit] == stackDirectionDown {
			// We never need to play a 5 if the stack is going down
			return false
		}

	} else if c.Rank == startCardRank {
		if g.StackDirections[c.Suit] == stackDirectionUndecided {
			// If the stack direction is undecided, "g.Stacks[c.Suit]" must equal 0 at this point
			// because otherwise the "START" card would have already been played
			// We only need to play a "START" card if
			// the 1 and the 5 of this suit are already discarded
			ranksToCheck := []int{1, 5}
			for i := range ranksToCheck {
				total, discarded := g.GetSpecificCardNum(c.Suit, i)
				if total != discarded {
					return false
				}
			}
			return true
		} else if g.StackDirections[c.Suit] == stackDirectionUp {
			// We never need to play a "START" card if the stack is going up
			return false
		} else if g.StackDirections[c.Suit] == stackDirectionDown {
			// We never need to play a "START" card if the stack is going down
			return false
		}
	}

	// Default case (we should never get here)
	return false
}

// variantUpOrDownIsDead returns true if it is no longer possible to play this card
// (taking into account the stack direction)
func variantUpOrDownIsDead(g *Game, c *Card) bool {
	// It is not possible for a card to be dead if the stack is already finished
	if g.StackDirections[c.Suit] == stackDirectionFinished {
		return false
	}

	// Compile a list of the preceding cards
	ranksToCheck := make([]int, 0)
	if g.StackDirections[c.Suit] == stackDirectionUndecided {
		if g.Stacks[c.Suit] == 0 {
			// The stack direction is undecided and no cards have been played
			// Thus, this card will only be dead if all three of the starting cards are discarded
			// (we assume that there is only one of each, e.g. one 1, one 5, and one START card)
			ranksToCheck = []int{1, 5, startCardRank}
			for i := range ranksToCheck {
				for _, deckCard := range g.Deck {
					if deckCard.Suit == c.Suit && deckCard.Rank == i && !deckCard.Discarded {
						return false
					}
				}
			}
			return true

		} else {
			// The stack direction is undecided and the "START" cards has been played
			// Thus, this card will only be dead if all of the 2's and all of the 4's have been discarded
			ranksToCheck = []int{2, 4}
			for i := range ranksToCheck {
				total, discarded := g.GetSpecificCardNum(c.Suit, i)
				if total == discarded {
					// The suit is "dead"
					return true
				}

				for _, deckCard := range g.Deck {
					if deckCard.Suit == c.Suit && deckCard.Rank == i && !deckCard.Discarded {
						return false
					}
				}
			}
			return true
		}

	} else if g.StackDirections[c.Suit] == stackDirectionUp {
		for i := 1; i < c.Rank; i++ {
			ranksToCheck = append(ranksToCheck, i)
		}

	} else if g.StackDirections[c.Suit] == stackDirectionDown {
		for i := 5; i > c.Rank; i-- {
			ranksToCheck = append(ranksToCheck, i)
		}
	}

	// Check to see if all of the preceding cards have been discarded
	for i := range ranksToCheck {
		total, discarded := g.GetSpecificCardNum(c.Suit, i)
		if total == discarded {
			// The suit is "dead"
			return true
		}
	}

	return false
}

// variantUpOrDownUpdateMaxScore goes through all the cards in the deck and calculates the maximum possible score
// (some important cards might have been discarded already)
func variantUpOrDownUpdateMaxScore(g *Game) {
	g.MaxScore = 0
	for suit := range g.Stacks {
		if g.StackDirections[suit] == stackDirectionUndecided {
			upWalk := variantUpOrDownWalk(g, suit, true)
			downWalk := variantUpOrDownWalk(g, suit, false)
			g.MaxScore += max(upWalk, downWalk)
		} else if g.StackDirections[suit] == stackDirectionUp {
			g.MaxScore += variantUpOrDownWalk(g, suit, true)
		} else if g.StackDirections[suit] == stackDirectionDown {
			g.MaxScore += variantUpOrDownWalk(g, suit, false)
		} else if g.StackDirections[suit] == stackDirectionFinished {
			g.MaxScore += 5
		}
	}
}

func variantUpOrDownWalk(g *Game, suit int, up bool) int {
	cardsThatCanStillBePlayed := 0
	if up {
		// First, check to see if the stack can still be started (going up)
		canBeStarted := false
		for rank := range []int{1, startCardRank} {
			total, discarded := g.GetSpecificCardNum(suit, rank)
			if total > discarded {
				canBeStarted = true
				break
			}
		}
		if !canBeStarted {
			return cardsThatCanStillBePlayed
		}
		cardsThatCanStillBePlayed++

		// Second, walk upwards
		for rank := 2; rank <= 5; rank++ {
			total, discarded := g.GetSpecificCardNum(suit, rank)
			if total > discarded {
				cardsThatCanStillBePlayed++
			} else {
				break
			}
		}

	} else {
		// First, check to see if the stack can still be started (going down)
		canBeStarted := false
		for rank := range []int{5, startCardRank} {
			total, discarded := g.GetSpecificCardNum(suit, rank)
			if total > discarded {
				canBeStarted = true
				break
			}
		}
		if !canBeStarted {
			return cardsThatCanStillBePlayed
		}
		cardsThatCanStillBePlayed++

		// Second, walk downwards
		for rank := 4; rank >= 1; rank-- {
			total, discarded := g.GetSpecificCardNum(suit, rank)
			if total > discarded {
				cardsThatCanStillBePlayed++
			} else {
				break
			}
		}
	}

	return cardsThatCanStillBePlayed
}

// variantUpOrDownCheckAllDead returns true if no more cards can be played on the stacks
func variantUpOrDownCheckAllDead(g *Game) bool {
	for suit, stackRank := range g.Stacks {
		// Search through the deck
		neededRanks := make([]int, 0)
		if g.StackDirections[suit] == stackDirectionUndecided {
			if stackRank == 0 {
				// Nothing is played on the stack
				neededRanks = []int{1, 5, startCardRank}
			} else if stackRank == startCardRank {
				// The "START" card is played on the stack
				neededRanks = []int{2, 4}
			}
		} else if g.StackDirections[suit] == stackDirectionUp {
			neededRanks = append(neededRanks, stackRank+1)
		} else if g.StackDirections[suit] == stackDirectionDown {
			neededRanks = append(neededRanks, stackRank-1)
		} else if g.StackDirections[suit] == stackDirectionFinished {
			continue
		}

		for _, c := range g.Deck {
			for neededRank := range neededRanks {
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
