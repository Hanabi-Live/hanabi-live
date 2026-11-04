package main

import (
	"path/filepath"
	"reflect"
	"testing"
)

// sudokuWalkUpAll returns, for every possible stack start, the number of cards that a stack can
// play when it is started at that rank: the longest consecutive sequence of cards that are not
// fully discarded, wrapping around from the largest rank to 1. A stack that starts in the middle of
// such a sequence cannot play the cards that come before it, so it necessarily scores less than a
// stack that starts at the beginning of the sequence.
//
// These expectations mirror the ones in "packages/game/src/rules/variants/sudoku.test.ts", which
// pin the same behavior in the shared client library.
func TestSudokuWalkUpAllLongestSequenceStartingAtEachRank(t *testing.T) {
	tests := []struct {
		name         string
		stackSize    int
		allDiscarded [5]bool
		want         []int
	}{
		{"5 discarded in a 5-card stack", 5, [5]bool{false, false, false, false, true}, []int{4, 3, 2, 1, 0}},
		{"3 discarded in a 5-card stack", 5, [5]bool{false, false, true, false, false}, []int{2, 1, 0, 4, 3}},
		{"1 discarded in a 5-card stack", 5, [5]bool{true, false, false, false, false}, []int{0, 4, 3, 2, 1}},
		{"2 and 5 discarded in a 5-card stack", 5, [5]bool{false, true, false, false, true}, []int{1, 0, 2, 1, 0}},
		{"1 and 4 discarded in a 5-card stack", 5, [5]bool{true, false, false, true, false}, []int{0, 2, 1, 0, 1}},
		{"4 discarded in a 4-card stack", 4, [5]bool{false, false, false, true}, []int{3, 2, 1, 0}},
		{"3 discarded in a 4-card stack", 4, [5]bool{false, false, true, false}, []int{2, 1, 0, 3}},
		{"1 and 4 discarded in a 4-card stack", 4, [5]bool{true, false, false, true}, []int{0, 2, 1, 0}},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			allMax, maxScores := sudokuWalkUpAll(tc.allDiscarded, tc.stackSize)
			if allMax {
				t.Fatal("allMax must be false when at least one rank is fully discarded")
			}
			if got := maxScores[:tc.stackSize]; !reflect.DeepEqual(got, tc.want) {
				t.Errorf("max scores = %d, want %d", got, tc.want)
			}
		})
	}

	t.Run("no rank is discarded", func(t *testing.T) {
		allMax, maxScores := sudokuWalkUpAll([5]bool{}, 5)
		if !allMax {
			t.Error("allMax must be true when no rank is fully discarded")
		}
		if want := [5]int{5, 5, 5, 5, 5}; maxScores != want {
			t.Errorf("max scores = %d, want %d", maxScores, want)
		}
	})
}

// The maximum score of a Sudoku game is the sum of the longest sequences that the remaining cards
// allow. A stack that has to start in the middle of a sequence cannot play the cards that come
// before it, so the game must not report a maximum score that requires those cards.
func TestSudokuGetMaxScoreCountsOnlyPlayableCards(t *testing.T) {
	oldPath, oldColors, oldSuits := jsonPath, colors, suits
	oldVariants, oldIDs, oldFullIDs := variants, variantIDMap, variantIDFullMap
	t.Cleanup(func() {
		jsonPath, colors, suits = oldPath, oldColors, oldSuits
		variants, variantIDMap, variantIDFullMap = oldVariants, oldIDs, oldFullIDs
	})

	jsonPath = filepath.Join("..", "..", "packages", "game", "src", "json")
	colorsInit()
	suitsInit()
	variantsInit()

	variant := variants["Sudoku (5 Suits)"]
	if variant == nil {
		t.Fatal(`the "Sudoku (5 Suits)" variant was not loaded`)
	}

	game := &Game{
		Variant:      variant,
		ExtraOptions: &ExtraOptions{},
		StackStarts:  make([]int, len(variant.Suits)),
	}
	game.InitDeck()

	// Discard every copy of the 5. No stack can play a 5 after that, so a stack that is started at
	// the 1 can only play 4 cards, one started at the 2 can only play 3, and so on.
	for _, card := range game.Deck {
		if card.Rank == 5 {
			card.Discarded = true
		}
	}

	// The five stacks have to be started with five different ranks, so the best possible result is
	// the sum of the sequences 4 + 3 + 2 + 1 + 0.
	if got := game.GetMaxScore(); got != 10 {
		t.Errorf("GetMaxScore() = %d, want 10", got)
	}
}
