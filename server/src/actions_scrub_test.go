package main

import (
	"encoding/json"
	"reflect"
	"testing"
)

func TestDuckClueIdentitiesAreScrubbedWithoutChangingAuthoritativeActions(t *testing.T) {
	for _, duck := range []bool{false, true} {
		table := &Table{
			Players: []*Player{{UserID: 1}, {UserID: 2}, {UserID: 3}},
			Spectators: []*Spectator{
				{UserID: 100, ShadowingPlayerIndex: -1},
				{UserID: 101, ShadowingPlayerIndex: 0},
			},
		}
		table.Game = &Game{
			Table:   table,
			Variant: &Variant{Duck: duck},
			Players: []*GamePlayer{{Index: 0}, {Index: 1}, {Index: 2}},
		}
		for _, kind := range []int{ClueTypeColor, ClueTypeRank} {
			original := ActionClue{
				Type: "clue", Clue: Clue{Type: kind, Value: 3},
				Giver: 0, Target: 1, List: []int{5, 7}, Turn: 2,
			}
			for _, replay := range []bool{false, true} {
				table.Replay = replay
				for _, user := range []int{1, 2, 3, 100, 101} {
					scrubbed := CheckScrub(table, original, user)
					expected := original
					if duck && !replay && user != 100 {
						expected.Clue = Clue{Type: -1, Value: -1}
					}
					if !reflect.DeepEqual(scrubbed, expected) {
						t.Fatalf("duck=%t replay=%t user=%d: %#v", duck, replay, user, scrubbed)
					}
					raw, err := json.Marshal(scrubbed)
					if err != nil {
						t.Fatal(err)
					}
					var wire ActionClue
					if err := json.Unmarshal(raw, &wire); err != nil {
						t.Fatal(err)
					}
					if !reflect.DeepEqual(wire, expected) {
						t.Fatal("Serialized clue projection changed")
					}
					if original.Clue.Type != kind || original.Clue.Value != 3 {
						t.Fatal("Scrubbing mutated authoritative clue history")
					}
				}
			}
		}
	}
}
