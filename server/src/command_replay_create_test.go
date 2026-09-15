package main

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestIsJSONValidSeedDeck(t *testing.T) {
	previousVariants := variants
	defer func() {
		variants = previousVariants
	}()
	variant := &Variant{
		Name:       DefaultVariantName,
		Suits:      []*Suit{{}, {}, {}, {}, {}},
		Ranks:      []int{1, 2, 3, 4, 5},
		ClueColors: []string{"Red", "Yellow", "Green", "Blue", "Purple"},
		StackSize:  5,
	}
	variants = map[string]*Variant{DefaultVariantName: variant}
	game := &Game{Variant: variant, ExtraOptions: &ExtraOptions{}}
	game.InitDeck()
	deck := game.CardIdentities
	invalidDeck := append([]*CardIdentity(nil), deck...)
	invalidDeck[0] = &CardIdentity{SuitIndex: 5, Rank: 1}

	testCases := []struct {
		name      string
		seed      string
		deck      []*CardIdentity
		action    *GameAction
		wantError string
	}{
		{
			name:   "seed without deck",
			seed:   "p4v0s1",
			action: &GameAction{Type: ActionTypePlay, Target: 7},
		},
		{
			name:   "seed with empty deck",
			seed:   "p4v0s1",
			deck:   []*CardIdentity{},
			action: &GameAction{Type: ActionTypeDiscard, Target: 49},
		},
		{
			name:      "seed with negative target",
			seed:      "p4v0s1",
			action:    &GameAction{Type: ActionTypePlay, Target: -1},
			wantError: "invalid target (card order) of -1",
		},
		{
			name:      "seed with target past deck",
			seed:      "p4v0s1",
			action:    &GameAction{Type: ActionTypeDiscard, Target: 50},
			wantError: "invalid target (card order) of 50",
		},
		{
			name:      "no seed or deck",
			action:    &GameAction{Type: ActionTypeRankClue, Target: 3, Value: 3},
			wantError: "The deck must have 50 cards",
		},
		{
			name:   "explicit deck without seed",
			deck:   deck,
			action: &GameAction{Type: ActionTypePlay, Target: 7},
		},
		{
			name:   "explicit deck with seed",
			seed:   "p4v0s1",
			deck:   deck,
			action: &GameAction{Type: ActionTypePlay, Target: 7},
		},
		{
			name:      "incomplete explicit deck with seed",
			seed:      "p4v0s1",
			deck:      deck[:1],
			action:    &GameAction{Type: ActionTypePlay, Target: 7},
			wantError: "The deck must have 50 cards",
		},
		{
			name:      "invalid explicit deck with seed",
			seed:      "p4v0s1",
			deck:      invalidDeck,
			action:    &GameAction{Type: ActionTypePlay, Target: 7},
			wantError: "invalid suit number",
		},
		{
			name:      "invalid seed without deck",
			seed:      "invalid seed!",
			action:    &GameAction{Type: ActionTypePlay, Target: 7},
			wantError: "Seed names can only contain",
		},
	}
	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			d := &CommandData{GameJSON: &GameJSON{
				Players: []string{"Alice", "Bob", "Cathy", "Donald"},
				Seed:    tc.seed,
				Deck:    tc.deck,
				Actions: []*GameAction{tc.action},
			}}
			valid, message := isJSONValid(d)
			if valid != (tc.wantError == "") || !strings.Contains(message, tc.wantError) {
				t.Fatalf("isJSONValid() = (%v, %q), want error %q", valid, message, tc.wantError)
			}
		})
	}

	t.Run("import seed-only JSON", func(t *testing.T) {
		var replay GameJSON
		err := json.Unmarshal([]byte(`{
			"players": ["Alice", "Bob", "Cathy", "Donald"],
			"actions": [
				{"type": 3, "target": 3, "value": 3},
				{"type": 0, "target": 7}
			],
			"seed": "p4v0s1"
		}`), &replay)
		if err != nil {
			t.Fatal(err)
		}
		d := &CommandData{GameJSON: &replay}
		if valid, message := isJSONValid(d); !valid {
			t.Fatal(message)
		}
		table := &Table{}
		loadJSONOptionsToTable(d, table)
		if table.ExtraOptions.CustomSeed != replay.Seed {
			t.Fatal("replay seed was not passed to game initialization")
		}
		seededGame := &Game{Variant: variant, ExtraOptions: table.ExtraOptions}
		seededGame.InitDeck()
		if len(seededGame.Deck) != 50 {
			t.Fatalf("generated deck has %d cards, want 50", len(seededGame.Deck))
		}
	})
}
