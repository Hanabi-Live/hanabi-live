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
