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

// variantSudokuPlay trys to play the specified card, assuming that the variant is a Sudoku variant
// If success and this is the last card of the stack, the stack direction and the stack starts are updated accordingly
// Returns if the card misplayed
func variantSudokuPlay(g *Game, c *Card) bool {
	variant := variants[g.Options.VariantName]
	if g.Stacks[c.SuitIndex] == 0 {
		for _, b := range g.StackStarts {
			if b == c.Rank {
				return false
			}
		}
		g.StackStarts[c.SuitIndex] = c.Rank
		return true
	} else {
		nextRank := g.Stacks[c.SuitIndex]%len(variant.Ranks) + 1
		failed := c.Rank != nextRank || g.PlayStackDirections[c.SuitIndex] == StackDirectionFinished
		if !failed {
			// This subtracts 1 (mod 5) from the stack starts and outputs one of 1,...,5
			finalRank := (g.StackStarts[c.SuitIndex]+len(variant.Ranks)-2)%len(variant.Ranks) + 1
			if c.Rank == finalRank {
				g.PlayStackDirections[c.SuitIndex] = StackDirectionFinished
			}
		}
		return failed
	}
}

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

func variantSudokuGetMaxScore(g *Game) int {
	// Calculating maximum scores in Sudoku variants is complicated, since the starting values of the stacks
	// are not predetermined, so we will also have to find the optimum distribution of starting values depending on
	// which cards remain.
	// Suits that have already at least one card played can be easily disregarded and treated similar to the usual
	// variants (except that cards wrap around from 5 to 1), since their maximum progress is independent of the rest
	// For all other suits, we will calculate their maximum score for each possible starting value.
	// Then, we need to find a maximum-weight matching assigning starting values to the suits (where we can of course
	// only pick starting values that are not used already)
	// Since the resulting matchings have size at most 5, it is not worth doing a proper bipartite-matching algorithm
	// here, since most instances will be trivial. Therefore, we will use the following practical approach:
	// 0. Init max_score = 0
	// 1. Filter out suits with known starting value, find out their maximum scores separately, add it to max_score
	// 2. For each suit, calculate {m1, ..., m5} as the maximum score for this suit if we start the suit at 1,...,5
	// 3. Filter out each suit with {m1, ..., m5} = {5,...,5}. For each, add 5 to max_score
	//   Note that OPT = 5 + OPT(subinstance), since we can just assign these suits arbitrarily
	// 4. Solve the remaining subinstance, assigning the remaining suits to the possible starting values with
	// 	 the computed weight {m1, ..., m5}
	//   We will do this by brute-force, which will be at most 120 possibilities to check, although in actual games,
	// 	 we will probably never have to do this, since for most of the suits, we should have one copy of each card
	//   or known starting value, in which case they will be filtered out in step 2 or 3 already.

	maxScore := 0
	maxPartialScores := [5][5]int{}
	unassignedSuits := make([]int, 0)
	for suitIndex, stackStart := range g.StackStarts {
		allMax, suitMaxScores := sudokuWalkUpAll(checkAllDiscarded(g, suitIndex))
		if allMax {
			maxScore += 5
			continue
		}
		if stackStart != 0 {
			maxScore += suitMaxScores[stackStart-1]
		}
		maxPartialScores[suitIndex] = suitMaxScores
		unassignedSuits = append(unassignedSuits, suitIndex)
	}
	if len(unassignedSuits) == 0 {
		return maxScore
	}

	bestAssignment := 0

	// At each entry of execution of the loop
	// - 'curAssignment' denotes a legal partial assignment of the unassignedSuits to the possible stack starts,
	//   where an assigment of -1 denotes 'no assignment'
	// - 'assigned' always denotes, for each of the stack starts, whether they are currently assigned to by some suit
	// - localSuitIndex tracks the (local: referring to unassignedSuits array) index of the suit whose assignment we
	//   will increment in the current iteration. In total, we choose lexicographic order here, so after incrementing
	//   some index, we will always increment the higher ones after
	// In each iteration, we will then increase the assignment of the localSuitIndex (if possible). If this is possible,
	// we evaluate the assigment if this was the lowest recursion level, otherwise we reset higher assignment and
	// recurse one level deeper. If this is not possible, then we decrease the localSuitIndex to increase the assignment
	// of a lower index.
	// Note that the loop naturally terminates when we cannot increase index 0 anymore, as then we would like to
	// increase assignment of index -1; we check for this as the break condition

	const unassigned = -1

	possibleStackStarts := variantSudokuGetFreeStackStarts(g)

	localSuitIndex := 0
	curAssignment := make([]int, len(unassignedSuits))
	for i, _ := range curAssignment {
		curAssignment[i] = unassigned
	}
	assigned := make([]bool, len(possibleStackStarts))

	for localSuitIndex > 0 {
		if curAssignment[localSuitIndex] != unassigned {
			assigned[curAssignment[localSuitIndex]] = false
		}
		couldIncrement := false
		for nextAssignment := curAssignment[localSuitIndex] + 1; nextAssignment < len(possibleStackStarts); nextAssignment++ {
			if !assigned[nextAssignment] {
				curAssignment[localSuitIndex] = nextAssignment
				assigned[nextAssignment] = true
				couldIncrement = true
				break
			}
		}
		if couldIncrement {
			if localSuitIndex == len(unassignedSuits)-1 {
				// evaluate the current assignment
				val := 0
				for suitIndex, assignment := range curAssignment {
					val += maxPartialScores[suitIndex][possibleStackStarts[assignment]]
				}
				bestAssignment = max(bestAssignment, val)
			}
			if localSuitIndex < len(unassignedSuits)-1 {
				// reset all assignments of the higher-indexed suits
				for higherlocalSuitIndex := localSuitIndex + 1; higherlocalSuitIndex < len(unassignedSuits); higherlocalSuitIndex++ {
					assigned[curAssignment[higherlocalSuitIndex]] = false
					curAssignment[higherlocalSuitIndex] = unassigned
				}
				localSuitIndex++
			}
		} else {
			// If we could not increment, decrease the suit index to increase a lower-indexed suit
			// Note that we already unassigned the current suit at the start of the loop
			localSuitIndex--
		}
	}

	// Now that we have the best assignment, we just need to put this together with the rest of the score
	maxScore += bestAssignment
	return maxScore
}

func checkAllDiscarded(g *Game, suitIndex int) [5]bool {
	allDiscarded := [5]bool{}
	for rank := 1; rank <= 5; rank++ {
		total, discarded := g.GetSpecificCardNum(suitIndex, rank)
		allDiscarded[rank-1] = total == discarded
	}
	return allDiscarded
}

// Returns a (sorted) list of the remaining free stack starts of the game
func variantSudokuGetFreeStackStarts(g *Game) []int {
	possibleStackStarts := make([]int, 0)
	for possibleStackStart := 1; possibleStackStart <= 5; possibleStackStart++ {
		if !contains(g.StackStarts, possibleStackStart) {
			possibleStackStarts = append(possibleStackStarts, possibleStackStart)
		}
	}
	return possibleStackStarts
}

// Given a bool vector indicating which card copies still exist, returns
// - a vector of the longest consecutive sequences starting at each of these values, wrapping around
// - boolean value indicating whether allDiscarded contained only truth values, i.e. the vector is [5,5,5,5,5]
func sudokuWalkUpAll(allDiscarded [5]bool) (bool, [5]int) {
	// We can solve this with a simple sweep-method, sweeping bottom-up and always keeping track of the last rank
	// that did not exist.
	// Upon encountering a new dead rank, we will write all previously visited values
	maxScores := [5]int{5, 5, 5, 5, 5}
	lastDead := -1
	for curVal := 0; curVal < 5; curVal++ {
		if allDiscarded[curVal%5] {
			// We hit a new dead card
			for writeVal := lastDead + 1; writeVal < curVal; writeVal++ {
				maxScores[writeVal] = curVal - lastDead - 1
			}
			maxScores[curVal] = 0
			lastDead = curVal
		}
	}
	// If no value was dead, we did not write anything so far, so we can just return
	if lastDead == -1 {
		return true, maxScores
	} else {
		// Here, we still need to write all 'higher' values, adding the longest sequence starting at 0
		for writeVal := lastDead + 1; writeVal < 5; writeVal++ {
			maxScores[writeVal] = min(maxScores[0]+5-writeVal, 5)
		}
		return false, maxScores
	}
}

// variantSudokuCheckAllDead returns true if no more cards can be played on the stacks
func variantSudokuCheckAllDead(g *Game) bool {
	// This implementation is way easier than finding the max score, since we can check each suit independently
	variant := variants[g.Options.VariantName]
	possibleStackStarts := variantSudokuGetFreeStackStarts(g)

	for suitIndex, stackRank := range g.Stacks {
		possibleNextRanks := make([]int, 0)
		if g.PlayStackDirections[suitIndex] == StackDirectionFinished {
			continue
		} else {
			if stackRank != 0 {
				// Find the next card up (cyclic)
				nextRank := stackRank%len(variant.Ranks) + 1
				possibleNextRanks = []int{nextRank}
			} else {
				// New stack start only limited by other started stacks
				possibleNextRanks = possibleStackStarts
			}
		}
		// Now, just check if there are cards left behind with the desired rank
		for _, c := range g.Deck {
			for _, possibleNextRank := range possibleNextRanks {
				if c.SuitIndex == suitIndex &&
					c.Rank == possibleNextRank &&
					!c.Discarded &&
					!c.CannotBePlayed {

					return false
				}
			}
		}
	}
	return true
}
