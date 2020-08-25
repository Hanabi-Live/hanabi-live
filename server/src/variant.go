package main

import (
	"strings"
)

type Variant struct {
	Name string
	// Each variant must have a unique numerical ID for seed generation purposes
	// (and for the database)
	ID                     int
	Suits                  []*Suit
	Ranks                  []int
	ClueColors             []string
	ClueRanks              []int
	ColorCluesTouchNothing bool
	RankCluesTouchNothing  bool
	SpecialRank            int // For e.g. Rainbow-Ones
	SpecialAllClueColors   bool
	SpecialAllClueRanks    bool
	SpecialNoClueColors    bool
	SpecialNoClueRanks     bool
	MaxScore               int
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
		if s.OneOfEach {
			deckSize += 5
		} else {
			deckSize += 10
		}
	}
	if v.IsUpOrDown() {
		deckSize -= len(v.Suits)
	}
	return deckSize
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
