package main

import (
	"strings"
)

type Variant struct {
	Name string
	// Each variant must have a unique numerical ID for seed generation purposes
	// (and for the database)
	ID                       int
	Suits                    []*Suit
	Ranks                    []int
	ClueColors               []string
	ClueRanks                []int
	StackSize                int
	ColorCluesTouchNothing   bool
	RankCluesTouchNothing    bool
	SpecialRank              int // For e.g. Rainbow-Ones
	SpecialRankAllClueColors bool
	SpecialRankAllClueRanks  bool
	SpecialRankNoClueColors  bool
	SpecialRankNoClueRanks   bool
	SpecialRankDeceptive     bool
	OddsAndEvens             bool
	Funnels                  bool
	Chimneys                 bool
	MaxScore                 int
}

func (v *Variant) IsAlternatingClues() bool {
	return strings.HasPrefix(v.Name, "Alternating Clues")
}

func (v *Variant) IsClueStarved() bool {
	return strings.HasPrefix(v.Name, "Clue Starved")
}

func (v *Variant) IsCowAndPig() bool {
	return strings.HasPrefix(v.Name, "Cow & Pig")
}

func (v *Variant) IsDuck() bool {
	return strings.HasPrefix(v.Name, "Duck")
}

func (v *Variant) IsThrowItInAHole() bool {
	return strings.HasPrefix(v.Name, "Throw It in a Hole")
}

func (v *Variant) IsUpOrDown() bool {
	return strings.HasPrefix(v.Name, "Up or Down")
}

func (v *Variant) IsSynesthesia() bool {
	return strings.HasPrefix(v.Name, "Synesthesia")
}

func (v *Variant) IsCriticalFours() bool {
	return strings.HasPrefix(v.Name, "Critical Fours")
}

func (v *Variant) IsSudoku() bool {
	return strings.HasPrefix(v.Name, "Sudoku")
}

func (v *Variant) HasReversedSuits() bool {
	if v.IsUpOrDown() {
		return true
	}

	for _, s := range v.Suits {
		if s.Reversed {
			return true
		}
	}
	return false
}

func (v *Variant) GetDeckSize() int {
	deckSize := 0
	for _, s := range v.Suits {
		deckSize += v.totalCardsInSuit(s)
	}
	return deckSize
}

func (v *Variant) totalCardsInSuit(suit *Suit) int {
	if suit.OneOfEach {
		if v.IsUpOrDown() {
			// A critical suit in up or down has all unique cards plus an extra start card.
			return v.StackSize + 1
		}
		return v.StackSize
	}

	if v.IsUpOrDown() || v.IsCriticalFours() {
		// The normal amount minus one because there is one more critical card
		return v.StackSize*2 - 1
	}

	// The normal amount: three 1's + two 2's + two 3's + two 4's + one 5. Or in Sudoku: 2 of each.
	return v.StackSize * 2
}

func (v *Variant) GetAdjustedClueTokens(clueTokens int) int {
	// In "Clue Starved" variants, each discard only grants 0.5 clue tokens
	// This is represented on the server by discards granting 1 clue token and clues costing 2 tokens
	// (to avoid having to use floating point numbers)
	if v.IsClueStarved() {
		return clueTokens * 2
	}

	return clueTokens
}

func (v *Variant) AtMaxClueTokens(clueTokens int) bool {
	return clueTokens >= v.GetAdjustedClueTokens(MaxClueNum)
}

func (v *Variant) ShouldGiveClueTokenForPlaying5() bool {
	return !v.IsThrowItInAHole()
}
