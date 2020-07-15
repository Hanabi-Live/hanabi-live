package main

import (
	"math/rand"
)

func (g *Game) InitDeck() {
	// If a custom deck was provided along with the game options,
	// then we can simply add every card to the deck as specified
	if g.ExtraOptions.CustomDeck != nil {
		for _, card := range g.ExtraOptions.CustomDeck {
			g.Deck = append(g.Deck, NewCard(card.SuitIndex, card.Rank))
			g.CardIdentities = append(g.CardIdentities, &CardIdentity{
				SuitIndex: card.SuitIndex,
				Rank:      card.Rank,
			})
		}
		return
	}

	// Suits are represented as a slice of integers from 0 to the number of suits - 1
	// (e.g. [0, 1, 2, 3, 4] for a "No Variant" game)
	for suitIndex, suitObject := range variants[g.Options.VariantName].Suits {
		// Ranks are represented as a slice of integers
		// (e.g. [1, 2, 3, 4, 5] for a "No Variant" game)
		for _, rank := range variants[g.Options.VariantName].Ranks {
			// In a normal suit of Hanabi, there are:
			// - three 1's
			// - two 2's
			// - two 3's
			// - two 4's
			// - one five
			var amountToAdd int
			if rank == 1 {
				amountToAdd = 3
				if variants[g.Options.VariantName].IsUpOrDown() || suitObject.Reversed {
					amountToAdd = 1
				}
			} else if rank == 5 {
				amountToAdd = 1
				if suitObject.Reversed {
					amountToAdd = 3
				}
			} else if rank == StartCardRank {
				amountToAdd = 1
			} else {
				amountToAdd = 2
			}
			if suitObject.OneOfEach {
				amountToAdd = 1
			}

			for i := 0; i < amountToAdd; i++ {
				// Add the card to the deck
				g.Deck = append(g.Deck, NewCard(suitIndex, rank))
				g.CardIdentities = append(g.CardIdentities, &CardIdentity{
					SuitIndex: suitIndex,
					Rank:      rank,
				})
			}
		}
	}
}

func (g *Game) ShuffleDeck() {
	// From: https://stackoverflow.com/questions/12264789/shuffle-array-in-go
	for i := range g.Deck {
		j := rand.Intn(i + 1)
		g.Deck[i], g.Deck[j] = g.Deck[j], g.Deck[i]
		g.CardIdentities[i], g.CardIdentities[j] = g.CardIdentities[j], g.CardIdentities[i]
	}
}
