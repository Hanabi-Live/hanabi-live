package main

import (
	"hash/crc64"
	"math/rand"
	"strings"
)

func (g *Game) InitDeck() {
	// If a custom deck was provided along with the game options,
	// then we can simply add every card to the deck as specified
	if g.Options.CustomDeck != nil {
		for _, card := range g.Options.CustomDeck {
			g.Deck = append(g.Deck, NewCard(card.Suit, card.Rank))
		}
		return
	}

	// Suits are represented as a slice of integers from 0 to the number of suits - 1
	// (e.g. {0, 1, 2, 3, 4} for a "No Variant" game)
	for suitInt, suitObject := range variants[g.Options.Variant].Suits {
		// Ranks are represented as a slice of integers
		// (e.g. {1, 2, 3, 4, 5} for a "No Variant" game)
		for _, rank := range variants[g.Options.Variant].Ranks {
			// In a normal suit of Hanabi, there are:
			// - three 1's
			// - two 2's
			// - two 3's
			// - two 4's
			// - one five
			var amountToAdd int
			if rank == 1 {
				amountToAdd = 3
				if strings.HasPrefix(g.Options.Variant, "Up or Down") {
					amountToAdd = 1
				}
			} else if rank == 5 {
				amountToAdd = 1
			} else if rank == startCardRank {
				amountToAdd = 1
			} else {
				amountToAdd = 2
			}
			if suitObject.OneOfEach {
				amountToAdd = 1
			}

			for i := 0; i < amountToAdd; i++ {
				// Add the card to the deck
				g.Deck = append(g.Deck, NewCard(suitInt, rank))
			}
		}
	}
}

// InitSeed seeds the random number generator with the game seed
// Golang's "rand.Seed()" function takes an int64, so we need to convert a string to an int64
// We use the CRC64 hash function to do this
// Also note that seeding with negative numbers will not work
func (g *Game) InitSeed() {
	crc64Table := crc64.MakeTable(crc64.ECMA)
	intSeed := crc64.Checksum([]byte(g.Seed), crc64Table)
	rand.Seed(int64(intSeed))
}

func (g *Game) ShuffleDeck() {
	logger.Debug("11111", g.Seed)
	// From: https://stackoverflow.com/questions/12264789/shuffle-array-in-go
	for i := range g.Deck {
		j := rand.Intn(i + 1)
		g.Deck[i], g.Deck[j] = g.Deck[j], g.Deck[i]
	}
}
