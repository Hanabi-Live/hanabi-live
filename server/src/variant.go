package main

import (
	"strconv"

	"github.com/Hanabi-Live/hanabi-live/logger"
)

type Variant struct {
	Name string
	// Each variant must have a unique numerical ID for seed generation purposes
	// (and for the database)
	ID                       int
	Suits                    []*Suit
	Ranks                    []int
	CriticalRank             int
	ScarceOnes               bool
	AlternatingClues         bool
	ClueStarved              bool
	CowAndPig                bool
	Duck                     bool
	ThrowItInAHole           bool
	UpOrDown                 bool
	Synesthesia              bool
	Sudoku                   bool
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
	return v.AlternatingClues
}

func (v *Variant) IsClueStarved() bool {
	return v.ClueStarved
}

func (v *Variant) IsCowAndPig() bool {
	return v.CowAndPig
}

func (v *Variant) IsDuck() bool {
	return v.Duck
}

func (v *Variant) IsThrowItInAHole() bool {
	return v.ThrowItInAHole
}

func (v *Variant) IsUpOrDown() bool {
	return v.UpOrDown
}

func (v *Variant) IsSynesthesia() bool {
	return v.Synesthesia
}

func (v *Variant) IsScarceOnes() bool {
	return v.ScarceOnes
}

func (v *Variant) IsSudoku() bool {
	return v.Sudoku
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

func (v *Variant) HasInvertedSuits() bool {
	for _, s := range v.Suits {
		if s.Inverted {
			return true
		}
	}
	return false
}

func (v *Variant) IsSuitInverted(suitIndex int) bool {
	return v.Suits[suitIndex].Inverted
}

func (v *Variant) GetDeckSize() int {
	deckSize := 0
	for _, s := range v.Suits {
		deckSize += v.totalCardsInSuit(s)
	}
	return deckSize
}

func (v *Variant) totalCardsInSuit(suit *Suit) int {
	total := 0
	for _, rank := range v.Ranks {
		total += numCopiesOfCard(suit, rank, v)
	}
	return total
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

func (v *Variant) ShouldGiveClueTokenForFinishingStack() bool {
	return !v.IsThrowItInAHole()
}

func (v *Variant) CalculateEfficiency(numPlayers int) float64 {
	cardsInDeck := v.GetDeckSize()
	var cardsPerHand int
	if val, ok := DefaultNumCardsPerHand[numPlayers]; ok {
		cardsPerHand = val
	} else {
		logger.Error("Failed to get the hand size for " + strconv.Itoa(numPlayers) + " while calculating efficiency for variant " + v.Name + ".")
		cardsPerHand = 4
	}
	cardsDealt := (cardsPerHand - 1) * numPlayers

	// We have to play numPlayers + 1 many consecutive cards in the endgame (if at pace 0).
	// Thus, 1 + numPlayers/v.StackSize (not this rounds down) many stacks cannot be finished before the endgame starts
	maxNumStacksFinishedBeforeEndgame := len(v.Suits) - numPlayers/v.StackSize - 1

	startingPace := cardsInDeck - cardsDealt - v.MaxScore

	startingClues := v.GetAdjustedClueTokens(MaxClueNum)
	numCluesGainedByFinishingStacks := maxNumStacksFinishedBeforeEndgame
	if !v.ShouldGiveClueTokenForFinishingStack() {
		numCluesGainedByFinishingStacks = 0
	}
	numCluesGainedByDiscards := startingPace
	totalAvailableClueTokens := startingClues + numCluesGainedByFinishingStacks + numCluesGainedByDiscards

	// In Clue Starved variants, discarding costs 2 tokens
	totalAvailableClues := totalAvailableClueTokens / v.GetAdjustedClueTokens(1)

	minEff := float64(v.MaxScore) / float64(totalAvailableClues)

	return minEff
}
