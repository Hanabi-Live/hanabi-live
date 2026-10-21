package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

// Mirror the five-rank copy rules in packages/game/src/rules/deck.ts.
func expectedCatalogCopies(meta VariantJSON, suit *Suit, rank int) int {
	if suit.OneOfEach || (meta.CriticalRank != 0 && rank == meta.CriticalRank) {
		return 1
	}
	if meta.Sudoku {
		return 2
	}
	switch rank {
	case 1:
		if meta.UpOrDown || suit.Reversed {
			return 1
		}
		if meta.ScarceOnes {
			return 2
		}
		return 3
	case 5:
		if suit.Reversed {
			return 3
		}
		return 1
	case StartCardRank:
		if meta.UpOrDown {
			return 1
		}
		return -1
	default:
		return 2
	}
}

func TestCatalogMetadataAndDeckParity(t *testing.T) {
	oldPath, oldColors, oldSuits := jsonPath, colors, suits
	oldVariants, oldIDs, oldFullIDs := variants, variantIDMap, variantIDFullMap
	oldNames, oldOdd, oldEven := variantNames, oddClues, evenClues
	defer func() {
		jsonPath, colors, suits = oldPath, oldColors, oldSuits
		variants, variantIDMap, variantIDFullMap = oldVariants, oldIDs, oldFullIDs
		variantNames, oddClues, evenClues = oldNames, oldOdd, oldEven
	}()

	jsonPath = filepath.Join("..", "..", "packages", "game", "src", "json")
	colorsInit()
	suitsInit()
	variantsInit()

	data, err := os.ReadFile(filepath.Join(jsonPath, "variants.json"))
	if err != nil {
		t.Fatal(err)
	}
	var catalog []VariantJSON
	if err := json.Unmarshal(data, &catalog); err != nil {
		t.Fatal(err)
	}
	if len(variants) != len(catalog) {
		t.Fatalf("loaded %d variants; catalog has %d", len(variants), len(catalog))
	}

	for _, meta := range catalog {
		v := variants[meta.Name]
		if v == nil {
			t.Errorf("variant %q was not loaded", meta.Name)
			continue
		}
		fields := []struct {
			name string
			got  bool
			want bool
		}{
			{"alternatingClues", v.IsAlternatingClues(), meta.AlternatingClues},
			{"clueStarved", v.IsClueStarved(), meta.ClueStarved},
			{"cowAndPig", v.IsCowAndPig(), meta.CowAndPig},
			{"duck", v.IsDuck(), meta.Duck},
			{"throwItInAHole", v.IsThrowItInAHole(), meta.ThrowItInAHole},
			{"upOrDown", v.IsUpOrDown(), meta.UpOrDown},
			{"synesthesia", v.IsSynesthesia(), meta.Synesthesia},
			{"sudoku", v.IsSudoku(), meta.Sudoku},
			{"scarceOnes", v.IsScarceOnes(), meta.ScarceOnes},
			{"funnels", v.Funnels, meta.Funnels},
			{"chimneys", v.Chimneys, meta.Chimneys},
			{"oddsAndEvens", v.OddsAndEvens, meta.OddsAndEvens},
		}
		for _, field := range fields {
			if field.got != field.want {
				t.Errorf("%s: %s = %v, want %v", meta.Name, field.name, field.got, field.want)
			}
		}
		if v.CriticalRank != meta.CriticalRank {
			t.Errorf("%s: criticalRank = %d, want %d", meta.Name, v.CriticalRank, meta.CriticalRank)
		}
		stackSize := meta.StackSize
		if stackSize == 0 {
			stackSize = DefaultPointsPerSuit
		}
		if v.StackSize != stackSize {
			t.Errorf("%s: stackSize = %d, want %d", meta.Name, v.StackSize, stackSize)
		}
		expectedRanks := deriveVariantRanks(stackSize, meta.UpOrDown)
		if !reflect.DeepEqual(v.Ranks, expectedRanks) {
			t.Errorf("%s: ranks = %v, want %v", meta.Name, v.Ranks, expectedRanks)
		}

		wantDeckSize := 0
		for _, suit := range v.Suits {
			for _, rank := range expectedRanks {
				wantCopies := expectedCatalogCopies(meta, suit, rank)
				wantDeckSize += wantCopies
				if got := numCopiesOfCard(suit, rank, v); got != wantCopies {
					t.Errorf("%s: suit %s rank %d has %d copies, want %d", meta.Name, suit.Name, rank, got, wantCopies)
				}
			}
		}
		if got := v.GetDeckSize(); got != wantDeckSize {
			t.Errorf("%s: deck size = %d, want %d", meta.Name, got, wantDeckSize)
		}
		game := &Game{Variant: v, ExtraOptions: &ExtraOptions{}}
		game.InitDeck()
		if len(game.Deck) != wantDeckSize || len(game.CardIdentities) != wantDeckSize {
			t.Errorf("%s: created %d cards and %d identities, want %d", meta.Name, len(game.Deck), len(game.CardIdentities), wantDeckSize)
		}
	}
}
