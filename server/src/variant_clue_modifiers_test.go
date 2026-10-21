package main

import "testing"

func TestSpecialRankClueModifierPrecedence(t *testing.T) {
	// These combinations are deliberately synthetic: the client supports composing
	// modifiers, and the server must follow its clue-touch precedence.
	tests := []struct {
		name      string
		variant   Variant
		cardRank  int
		clueRank  int
		wantTouch bool
	}{
		{
			name:      "funnels beats special-rank exclusion",
			variant:   Variant{Funnels: true, SpecialRank: 1, SpecialRankNoClueRanks: true},
			cardRank:  1,
			clueRank:  3,
			wantTouch: true,
		},
		{
			name:      "funnels beats special-rank inclusion",
			variant:   Variant{Funnels: true, SpecialRank: 3, SpecialRankAllClueRanks: true},
			cardRank:  3,
			clueRank:  2,
			wantTouch: false,
		},
		{
			name:      "chimneys beats special-rank exclusion",
			variant:   Variant{Chimneys: true, SpecialRank: 4, SpecialRankNoClueRanks: true},
			cardRank:  4,
			clueRank:  2,
			wantTouch: true,
		},
		{
			name:      "chimneys beats special-rank inclusion",
			variant:   Variant{Chimneys: true, SpecialRank: 2, SpecialRankAllClueRanks: true},
			cardRank:  2,
			clueRank:  4,
			wantTouch: false,
		},
		{
			name:      "odds and evens beats special-rank exclusion",
			variant:   Variant{OddsAndEvens: true, SpecialRank: 3, SpecialRankNoClueRanks: true},
			cardRank:  3,
			clueRank:  1,
			wantTouch: true,
		},
		{
			name:      "odds and evens beats special-rank inclusion",
			variant:   Variant{OddsAndEvens: true, SpecialRank: 4, SpecialRankAllClueRanks: true},
			cardRank:  4,
			clueRank:  1,
			wantTouch: false,
		},
		{
			name:      "standalone special-rank all ranks still applies",
			variant:   Variant{SpecialRank: 2, SpecialRankAllClueRanks: true},
			cardRank:  2,
			clueRank:  5,
			wantTouch: true,
		},
		{
			name:      "standalone special-rank deceptive still applies",
			variant:   Variant{SpecialRank: 2, SpecialRankDeceptive: true, ClueRanks: []int{1, 2, 3}},
			cardRank:  2,
			clueRank:  1,
			wantTouch: true,
		},
	}

	oldOdd, oldEven := oddClues, evenClues
	oddClues = []int{1, 3, 5}
	evenClues = []int{2, 4}
	defer func() {
		oddClues, evenClues = oldOdd, oldEven
	}()

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			variant := tc.variant
			variant.Name = "Unrelated custom variant"
			variant.Suits = []*Suit{{}}
			clue := Clue{Type: ClueTypeRank, Value: tc.clueRank}
			card := NewCard(0, tc.cardRank)
			if got := variantIsCardTouched(&variant, clue, card); got != tc.wantTouch {
				t.Errorf("clue %d touching rank %d = %v, want %v", tc.clueRank, tc.cardRank, got, tc.wantTouch)
			}
		})
	}
}
