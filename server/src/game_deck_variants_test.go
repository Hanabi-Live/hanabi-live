package main

import (
	"encoding/json"
	"testing"
)

func TestRankModifierDeckCounts(t *testing.T) {
	tests := []struct {
		name         string
		numSuits     int
		rank1        int
		rank4        int
		totalDeck    int
		criticalRank int
		scarceOnes   bool
	}{
		{"Scarce Ones & Critical Fours (6 Suits)", 6, 2, 1, 48, 4, true},
		{"Scarce Ones (5 Suits)", 5, 2, 2, 45, 0, true},
		{"Critical Fours (5 Suits)", 5, 3, 1, 45, 4, false},
		{"No Variant", 5, 3, 2, 50, 0, false},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			suits := make([]*Suit, tc.numSuits)
			for i := range suits {
				suits[i] = &Suit{}
			}
			variant := &Variant{
				Name:         tc.name,
				Suits:        suits,
				Ranks:        []int{1, 2, 3, 4, 5},
				StackSize:    5,
				CriticalRank: tc.criticalRank,
				ScarceOnes:   tc.scarceOnes,
			}
			game := &Game{Variant: variant, ExtraOptions: &ExtraOptions{}}
			game.InitDeck()

			if got := variant.GetDeckSize(); got != tc.totalDeck {
				t.Errorf("GetDeckSize() = %d, want %d", got, tc.totalDeck)
			}
			if got := len(game.Deck); got != tc.totalDeck {
				t.Errorf("InitDeck() created %d cards, want %d", got, tc.totalDeck)
			}
			for _, rank := range []int{1, 4} {
				want := tc.rank1
				if rank == 4 {
					want = tc.rank4
				}
				copies := 0
				for _, card := range game.Deck {
					if card.SuitIndex == 0 && card.Rank == rank {
						copies++
					}
				}
				if copies != want {
					t.Errorf("rank %d has %d copies in suit 0, want %d", rank, copies, want)
				}
			}
		})
	}
}

func TestCombinedRankModifierJSONFlags(t *testing.T) {
	var variant VariantJSON
	err := json.Unmarshal([]byte(`{"name":"Scarce Ones & Critical Fours (6 Suits)","scarceOnes":true,"criticalRank":4}`), &variant)
	if err != nil {
		t.Fatal(err)
	}
	if !variant.ScarceOnes || variant.CriticalRank != 4 {
		t.Fatalf("decoded modifiers: scarceOnes=%v, criticalRank=%d", variant.ScarceOnes, variant.CriticalRank)
	}
}
