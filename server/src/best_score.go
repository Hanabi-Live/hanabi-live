package main

type BestScore struct {
	NumPlayers   int     `json:"numPlayers"`
	Score        int     `json:"score"`
	Modifier     Bitmask `json:"modifier"` // (see the stats section in "gameEnd.go")
	DeckPlays    bool    `json:"deckPlays"`
	EmptyClues   bool    `json:"emptyClues"`
	OneExtraCard bool    `json:"oneExtraCard"`
	OneLessCard  bool    `json:"oneLessCard"`
	AllOrNothing bool    `json:"allOrNothing"`
}

func NewBestScores() []*BestScore {
	bestScores := make([]*BestScore, 5) // From 2 to 6 players
	for i := range bestScores {
		// This will not work if written as "for i, bestScore :="
		bestScores[i] = &BestScore{}
		bestScores[i].NumPlayers = i + 2
	}
	return bestScores
}

// IsBetterThan returns true if the best score is "better", according for the modifiers
// (e.g. bottom-deck blind play, empty clues, etc.)
//
// A best score is better when:
// - it has a higher score
// - it has an equal score but has less modifiers (by comparing the bitflags numerically)
//
// For example:
// - Alice's best score for 2-player no variant is 30 points with bottom-deck blind-plays enabled
// - Bob's best score for 2-player no variant is 30 points with one extra card enabled
// - Alice's modifier bitflag is equal to 1
// - Bob's modifier bitflag is equal to 4
// - Alice has the better best score because 1 < 4
func (bestScoreA *BestScore) IsBetterThan(bestScoreB *BestScore) bool {
	return bestScoreA.Score > bestScoreB.Score ||
		(bestScoreA.Score == bestScoreB.Score &&
			bestScoreA.Modifier < bestScoreB.Modifier)
}
