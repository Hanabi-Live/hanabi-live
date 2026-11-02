package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"path/filepath"
	"testing"
)

func TestDeckSetupCompatibility(t *testing.T) {
	loadCompatibilityCatalog(t)
	type deckCase struct {
		Variant string `json:"variant"`
		Seed    string `json:"seed"`
		Size    int    `json:"size"`
		Digest  string `json:"digest"`
	}
	var cases []deckCase
	for _, name := range variantNames {
		variant := variants[name]
		seed := fmt.Sprintf("p2v%ds1", variant.ID)
		game := &Game{Seed: seed, Variant: variant, ExtraOptions: &ExtraOptions{}}
		game.InitDeck()
		game.ShuffleDeck()
		encoded, err := json.Marshal(game.CardIdentities)
		if err != nil {
			t.Fatal(err)
		}
		digest := sha256.Sum256(encoded)
		cases = append(cases, deckCase{name, seed, len(game.Deck), hex.EncodeToString(digest[:])})
	}
	checkRandomFixture(t, filepath.Join("testdata", "deck_setup.json"), cases)
}

func TestCharacterSetupCompatibility(t *testing.T) {
	loadCompatibilityCatalog(t)
	type assignment struct {
		Name     string `json:"name"`
		Metadata int    `json:"metadata"`
	}
	type characterCase struct {
		Variant     string       `json:"variant"`
		Seed        string       `json:"seed"`
		Players     []string     `json:"players"`
		Assignments []assignment `json:"assignments"`
	}
	var cases []characterCase
	for _, name := range []string{"No Variant", "6 Suits", "Up or Down (5 Suits)"} {
		for _, numPlayers := range []int{2, 4, 6} {
			for suffix := 1; suffix <= 12; suffix++ {
				seed := fmt.Sprintf("p%dv%ds%d", numPlayers, variants[name].ID, suffix)
				entry := characterCase{Variant: name, Seed: seed}
				game := &Game{
					Seed: seed, Variant: variants[name],
					Options: &Options{DetrimentalCharacters: true}, ExtraOptions: &ExtraOptions{},
				}
				for _, player := range []string{"Alice", "Bob", "Cathy", "Donald", "Emily", "Felix"}[:numPlayers] {
					entry.Players = append(entry.Players, player)
					game.Players = append(game.Players, &GamePlayer{Name: player})
				}
				charactersGenerate(game)
				for _, player := range game.Players {
					entry.Assignments = append(entry.Assignments, assignment{player.Character, player.CharacterMetadata})
				}
				cases = append(cases, entry)
			}
		}
	}
	debug := characterCase{
		Variant: "No Variant", Seed: "legacy-1-p4v0s1",
		Players: []string{"test", "Bob", "test2", "Donald"},
	}
	game := &Game{
		Seed: debug.Seed, Variant: variants[debug.Variant],
		Options: &Options{DetrimentalCharacters: true}, ExtraOptions: &ExtraOptions{},
	}
	for _, name := range debug.Players {
		game.Players = append(game.Players, &GamePlayer{Name: name})
	}
	charactersGenerate(game)
	for _, player := range game.Players {
		debug.Assignments = append(debug.Assignments, assignment{player.Character, player.CharacterMetadata})
	}
	cases = append(cases, debug)
	checkRandomFixture(t, filepath.Join("testdata", "character_setup.json"), cases)
}
