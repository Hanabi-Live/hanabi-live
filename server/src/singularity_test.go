package main

import (
	"reflect"
	"testing"
)

func TestSingularityTouches(t *testing.T) {
	variant := &Variant{
		Suits: []*Suit{
			{Name: "Red", ClueColors: []string{"Red"}},
			{Name: "Light Pink Singularity", NoClueColors: true, AllClueRanks: true, Singularity: true},
			{Name: "Rainbow Singularity", AllClueColors: true, Singularity: true},
			{Name: "Omni Singularity", AllClueColors: true, AllClueRanks: true, Singularity: true},
			{Name: "Null Singularity", NoClueColors: true, NoClueRanks: true, Singularity: true, AbsorbsUnmatchedClues: true},
			{Name: "Blue Singularity", ClueColors: []string{"Blue"}, Singularity: true},
		},
		ClueColors: []string{"Red"},
		ClueRanks:  []int{1, 2, 3, 4, 5},
	}
	cases := []struct {
		name string
		hand []*Card
		clue Clue
		want []int
	}{
		{"ordinary passes other ranks", []*Card{{SuitIndex: 5, Rank: 3}, {SuitIndex: 0, Rank: 2}}, Clue{Type: ClueTypeRank, Value: 2}, []int{1}},
		{"ordinary absorbs own rank", []*Card{{SuitIndex: 5, Rank: 3}, {SuitIndex: 0, Rank: 3}}, Clue{Type: ClueTypeRank, Value: 3}, []int{0}},
		{"ordinary passes other colors", []*Card{{SuitIndex: 5, Rank: 3}, {SuitIndex: 0, Rank: 2}}, Clue{Type: ClueTypeColor, Value: 0}, []int{1}},
		{"rank absorbs matching normal card", []*Card{{SuitIndex: 0, Rank: 1}, {SuitIndex: 1, Rank: 3}}, Clue{Type: ClueTypeRank, Value: 1}, []int{1}},
		{"rank leaves colors alone", []*Card{{SuitIndex: 0, Rank: 1}, {SuitIndex: 1, Rank: 3}}, Clue{Type: ClueTypeColor, Value: 0}, []int{0}},
		{"color absorbs", []*Card{{SuitIndex: 0, Rank: 1}, {SuitIndex: 2, Rank: 3}}, Clue{Type: ClueTypeColor, Value: 0}, []int{1}},
		{"rainbow absorbs its own rank", []*Card{{SuitIndex: 0, Rank: 1}, {SuitIndex: 2, Rank: 1}}, Clue{Type: ClueTypeRank, Value: 1}, []int{1}},
		{"omni absorbs rank", []*Card{{SuitIndex: 0, Rank: 1}, {SuitIndex: 3, Rank: 3}}, Clue{Type: ClueTypeRank, Value: 1}, []int{1}},
		{"omni absorbs color", []*Card{{SuitIndex: 0, Rank: 1}, {SuitIndex: 3, Rank: 3}}, Clue{Type: ClueTypeColor, Value: 0}, []int{1}},
		{"all absorbers touched", []*Card{{SuitIndex: 1, Rank: 1}, {SuitIndex: 0, Rank: 2}, {SuitIndex: 1, Rank: 5}}, Clue{Type: ClueTypeRank, Value: 2}, []int{0, 2}},
		{"mixed rank channel", []*Card{{SuitIndex: 0, Rank: 1}, {SuitIndex: 1, Rank: 3}, {SuitIndex: 2, Rank: 1}}, Clue{Type: ClueTypeRank, Value: 1}, []int{1, 2}},
		{"mixed color channel", []*Card{{SuitIndex: 0, Rank: 1}, {SuitIndex: 1, Rank: 3}, {SuitIndex: 2, Rank: 1}}, Clue{Type: ClueTypeColor, Value: 0}, []int{2}},
		{"no absorbers", []*Card{{SuitIndex: 0, Rank: 1}, {SuitIndex: 0, Rank: 2}}, Clue{Type: ClueTypeRank, Value: 1}, []int{0}},
		{"empty clue", []*Card{{SuitIndex: 0, Rank: 2}}, Clue{Type: ClueTypeRank, Value: 1}, []int{}},
		{"null absorbs rank without touching", []*Card{{SuitIndex: 0, Rank: 1}, {SuitIndex: 4, Rank: 3}}, Clue{Type: ClueTypeRank, Value: 1}, []int{}},
		{"null absorbs color without touching", []*Card{{SuitIndex: 0, Rank: 1}, {SuitIndex: 4, Rank: 3}}, Clue{Type: ClueTypeColor, Value: 0}, []int{}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			for i, card := range tc.hand {
				card.Order = i
			}
			p := &GamePlayer{Game: &Game{Variant: variant}, Hand: tc.hand}
			if (tc.name == "null absorbs rank without touching" || tc.name == "null absorbs color without touching") && !p.IsClueAbsorbed(tc.clue) {
				t.Fatal("absorbed empty clue must be legal without the Empty Clues option")
			}
			if got := p.FindCardsTouchedByClue(tc.clue); !reflect.DeepEqual(got, tc.want) {
				t.Fatalf("touched %v, want %v", got, tc.want)
			}
			if p.IsFirstCardTouchedByClue(tc.clue) != intInSlice(len(tc.hand)-1, tc.want) ||
				p.IsLastCardTouchedByClue(tc.clue) != intInSlice(0, tc.want) {
				t.Fatal("character endpoint checks disagree with actual touches")
			}
		})
	}
}
