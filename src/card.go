package main

import (
	"strconv"
)

type Card struct {
	Order     int
	Suit      int
	Rank      int
	Touched   bool
	Slot      int // Written/assigned after the deck is shuffled
	Failed    bool
	Discarded bool
	Played    bool
}

func (c *Card) Name(g *Game) string {
	return variants[g.Options.Variant].Suits[c.Suit].Name + " " + strconv.Itoa(c.Rank)
}

func (c *Card) IsAlreadyPlayed(g *Game) bool {
	// Go through the deck and search to see if the other matching cards are already played
	for _, deckCard := range g.Deck {
		// Skip this card
		if deckCard.Order == c.Order {
			continue
		}

		if deckCard.Suit == c.Suit && deckCard.Rank == c.Rank && deckCard.Played {
			return true
		}
	}

	return false
}

func (c *Card) IsCritical(g *Game) bool {
	// Search through the deck for other copies of the card
	for _, deckCard := range g.Deck {
		if deckCard.Order == c.Order {
			// Skip over this card
			continue
		}

		if deckCard.Suit == c.Suit && deckCard.Rank == c.Rank && !deckCard.Discarded {
			return false
		}
	}

	return true
}

func (c *Card) IsDead(g *Game) bool {
	// Check to see if the card is "dead"
	// (meaning that all the copies of some previous rank have been discarded, so it is no longer possible to play this card)
	for i := 1; i < c.Rank; i++ {
		// Start with the 1s, then the 2s, etc., checking to see if they are all discarded
		totalCardsNotDiscarded := 3
		if i > 1 {
			totalCardsNotDiscarded = 2
		}
		if variants[g.Options.Variant].Suits[c.Suit].IsOneOfEach {
			totalCardsNotDiscarded = 1
		}
		for _, deckCard := range g.Deck {
			if deckCard.Suit == c.Suit && deckCard.Rank == i && deckCard.Discarded {
				totalCardsNotDiscarded--
			}
		}
		if totalCardsNotDiscarded == 0 {
			// The suit is "dead"
			return true
		}
	}

	return false
}
