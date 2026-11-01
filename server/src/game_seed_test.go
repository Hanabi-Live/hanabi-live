package main

import (
	"fmt"
	"math/rand"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

// Captured from the original serial setup path before isolating its random generators.
var seededGameFixtures = []struct {
	seed       string
	numPlayers int
	deck       string
	characters []CharacterAssignment
}{
	{
		seed:       "p2v0s1",
		numPlayers: 2,
		deck:       "3:5 4:4 3:3 0:4 2:1 3:3 3:1 0:1 2:2 2:4 0:2 3:2 2:2 4:1 0:2 0:1 3:1 1:3 1:4 0:1 1:4 2:4 4:2 4:3 4:1 0:4 2:5 1:2 4:1 1:1 1:5 1:1 2:3 0:5 4:3 1:2 3:1 2:3 1:3 3:4 1:1 0:3 3:4 0:3 2:1 3:2 2:1 4:4 4:5 4:2",
		characters: []CharacterAssignment{{Name: "Mood Swings", Metadata: -1}, {Name: "Fuming", Metadata: 2}},
	},
	{
		seed:       "p2v0s4",
		numPlayers: 2,
		deck:       "4:1 2:3 0:1 1:2 0:4 3:3 1:4 3:5 0:5 2:4 2:1 2:4 4:4 0:2 1:1 2:1 4:5 4:1 3:4 0:4 2:2 4:3 3:2 4:4 1:4 4:3 2:5 3:1 4:1 2:1 1:1 3:1 2:3 0:3 1:2 4:2 0:3 4:2 1:1 3:4 3:3 1:3 3:2 0:1 0:2 1:5 0:1 1:3 3:1 2:2",
		characters: []CharacterAssignment{{Name: "Dumbfounded", Metadata: 4}, {Name: "Hesitant", Metadata: -1}},
	},
	{
		seed:       "p4v0s1",
		numPlayers: 4,
		deck:       "1:4 1:1 1:4 3:3 3:1 4:4 3:2 4:1 1:1 4:1 2:4 3:4 4:4 0:3 4:3 1:2 0:3 3:5 0:2 2:5 2:1 0:1 4:5 0:1 4:2 2:2 0:2 1:5 0:4 1:2 4:3 3:2 4:2 0:5 2:1 4:1 3:4 3:1 0:4 1:1 0:1 2:4 1:3 1:3 2:3 2:1 3:3 3:1 2:3 2:2",
		characters: []CharacterAssignment{
			{Name: "Compulsive", Metadata: -1}, {Name: "Blind Spot", Metadata: -1},
			{Name: "Hesitant", Metadata: -1}, {Name: "Slow-Witted", Metadata: -1},
		},
	},
	{
		seed:       "p6v0s1",
		numPlayers: 6,
		deck:       "1:5 0:4 4:4 2:2 3:1 2:5 0:2 4:2 1:4 2:1 3:3 2:4 1:3 2:1 3:4 2:2 0:3 4:1 4:3 1:2 1:2 1:4 2:3 3:5 3:1 1:3 0:1 1:1 3:2 4:1 3:2 1:1 4:2 0:3 4:3 0:1 0:4 0:1 2:3 3:1 4:4 2:1 0:5 4:5 1:1 3:3 0:2 2:4 3:4 4:1",
		characters: []CharacterAssignment{
			{Name: "Spiteful", Metadata: -1}, {Name: "Insistent", Metadata: -1},
			{Name: "Impulsive", Metadata: -1}, {Name: "Blind Spot", Metadata: -1},
			{Name: "Quacker", Metadata: -1}, {Name: "Wasteful", Metadata: -1},
		},
	},
}

func loadSeededGameCharacters(t *testing.T) {
	t.Helper()
	oldPath := jsonPath
	oldCharacters, oldIDs, oldNames := characters, characterIDMap, characterNames
	t.Cleanup(func() {
		jsonPath = oldPath
		characters, characterIDMap, characterNames = oldCharacters, oldIDs, oldNames
	})
	jsonPath = filepath.Join("..", "..", "packages", "game", "src", "json")
	charactersInit()
}

func newSeededTestGame(seed string, numPlayers int) *Game {
	g := &Game{
		Seed: seed,
		Variant: &Variant{
			Name:       DefaultVariantName,
			Suits:      []*Suit{{}, {}, {}, {}, {}},
			Ranks:      []int{1, 2, 3, 4, 5},
			ClueColors: []string{"Red", "Yellow", "Green", "Blue", "Purple"},
			StackSize:  5,
		},
		Options:      &Options{DetrimentalCharacters: true},
		ExtraOptions: &ExtraOptions{},
	}
	for i := 0; i < numPlayers; i++ {
		g.Players = append(g.Players, &GamePlayer{Name: defaultPlayerNames[i]})
	}
	g.InitDeck()
	return g
}

func assertSeededDeck(t *testing.T, g *Game, want string) {
	t.Helper()
	if len(g.Deck) != len(g.CardIdentities) {
		t.Fatal("deck and card identities have different lengths")
	}
	var identities []string
	for i, card := range g.Deck {
		identity := g.CardIdentities[i]
		if card.SuitIndex != identity.SuitIndex || card.Rank != identity.Rank {
			t.Fatalf("deck and identity differ at index %d", i)
		}
		identities = append(identities, fmt.Sprintf("%d:%d", card.SuitIndex, card.Rank))
	}
	if got := strings.Join(identities, " "); got != want {
		t.Fatalf("seed %q deck = %s, want %s", g.Seed, got, want)
	}
}

func assertSeededCharacters(t *testing.T, g *Game, want []CharacterAssignment) {
	t.Helper()
	var got []CharacterAssignment
	for _, player := range g.Players {
		got = append(got, CharacterAssignment{Name: player.Character, Metadata: player.CharacterMetadata})
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("seed %q characters = %v, want %v", g.Seed, got, want)
	}
}

func TestSeededGameLegacyCompatibility(t *testing.T) {
	loadSeededGameCharacters(t)
	for _, fixture := range seededGameFixtures {
		for _, prefix := range []string{"", "legacy-1-", "legacy-2-"} {
			seed := prefix + fixture.seed
			t.Run(seed, func(t *testing.T) {
				g := newSeededTestGame(seed, fixture.numPlayers)
				g.ShuffleDeck()
				charactersGenerate(g)
				assertSeededDeck(t, g, fixture.deck)
				assertSeededCharacters(t, g, fixture.characters)
			})
		}
	}
}

func TestShuffleDeckRandomIsolation(t *testing.T) {
	t.Setenv("GODEBUG", "randseednop=0")
	fixture := seededGameFixtures[0]
	g := newSeededTestGame(fixture.seed, fixture.numPlayers)
	rand.Seed(123)
	g.ShuffleDeck()
	assertSeededDeck(t, g, fixture.deck)
}

func TestCharacterGenerationRandomIsolation(t *testing.T) {
	// Enable global reseeding only for this isolation assertion on modern Go.
	t.Setenv("GODEBUG", "randseednop=0")
	loadSeededGameCharacters(t)
	fixture := seededGameFixtures[0]
	g := newSeededTestGame(fixture.seed, fixture.numPlayers)
	rand.Seed(123)
	wantNextRandom := rand.Int63()
	rand.Seed(123)
	charactersGenerate(g)
	assertSeededCharacters(t, g, fixture.characters)
	if got := rand.Int63(); got != wantNextRandom {
		t.Fatalf("character generation changed the shared random generator: got %d, want %d", got, wantNextRandom)
	}
}

func TestConcurrentSeededGames(t *testing.T) {
	loadSeededGameCharacters(t)
	for _, fixture := range seededGameFixtures {
		fixture := fixture
		t.Run(fixture.seed, func(t *testing.T) {
			t.Parallel()
			for i := 0; i < 20; i++ {
				g := newSeededTestGame(fixture.seed, fixture.numPlayers)
				getRandom(0, 100)
				g.ShuffleDeck()
				charactersGenerate(g)
				assertSeededDeck(t, g, fixture.deck)
				assertSeededCharacters(t, g, fixture.characters)
			}
		})
	}
}
