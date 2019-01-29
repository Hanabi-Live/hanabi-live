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

	// The final card in an already-decided stack must be played
	if (g.StackDirections[c.Suit] == stackDirectionUp && c.Rank == 5) ||
		(g.StackDirections[c.Suit] == stackDirectionDown && c.Rank == 1) {

		return true
	}

	// For undecided piles, between the 1, the 5, and the "START" card,
	// two of them have to be played
	if g.StackDirections[c.Suit] == stackDirectionUndecided {
		ranksToCheck := []int{1, 5, startCardRank}
		startingCardsDiscarded := 0
		for i := range ranksToCheck {
			total, discarded := g.GetSpecificCardNum(c.Suit, i)
			if total == discarded {
				startingCardsDiscarded++
			}
		}
		if startingCardsDiscarded > 1 {
			return true
		}
	}

	// Default case; if the card does not meet the above conditions, it does not need to be played
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
		if g.Stacks[c.Suit] == startCardRank || c.Rank == 3 {
			// If the "START" card is played on the stack,
			// then this card will be dead if all of the 2's and all of the 4's have been discarded
			// (this situation also applies to 3's when no cards have been played on the stack)
			dead := true
			ranksToCheck = []int{2, 4}
			for i := range ranksToCheck {
				for _, deckCard := range g.Deck {
					if deckCard.Suit == c.Suit && deckCard.Rank == i && !deckCard.Discarded {
						dead = false
						break
					}
				}
				if !dead {
					break
				}
			}
			if dead {
				return true
			}
		}

		if g.Stacks[c.Suit] == 0 {
			// No cards are played yet on this stack
			// (or this is a 3 and a "START" card has been played on the stack)
			// No matter what the rank of this card is, it will be dead if all three of
			// the starting cards of the suit are discarded
			// (we assume that there is only one of each, e.g. one 1, one 5, and one "START" card)
			dead := false
			ranksToCheck = []int{1, 5, startCardRank}
			for i := range ranksToCheck {
				for _, deckCard := range g.Deck {
					if deckCard.Suit == c.Suit && deckCard.Rank == i && !deckCard.Discarded {
						dead = false
						break
					}
				}
				if !dead {
					break
				}
			}
			if dead {
				return true
			}
		}

	} else if g.StackDirections[c.Suit] == stackDirectionUp {
		for i := 2; i < c.Rank; i++ {
			total, discarded := g.GetSpecificCardNum(c.Suit, i)
			if total == discarded {
				return true
			}
		}

	} else if g.StackDirections[c.Suit] == stackDirectionDown {
		for i := 4; i > c.Rank; i-- {
			total, discarded := g.GetSpecificCardNum(c.Suit, i)
			if total == discarded {
				return true
			}
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
