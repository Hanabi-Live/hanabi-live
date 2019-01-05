package main

import (
	"strconv"
	"strings"
)

type Card struct {
	Order            int // Assigned after the deck is shuffled
	Suit             int
	Rank             int
	Touched          bool
	Slot             int // Assigned after the card is removed from a player's hand
	Failed           bool
	Discarded        bool
	Played           bool
	InsistentTouched bool // Used by the "Insistent" character
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

// IsCritical returns true if this card is the last non-discarded card left
// This is used to indicate "Double Discard" situations and for the sad sound effect
func (c *Card) IsCritical(g *Game) bool {
	// For simplicity, START cards are never considered critical
	// (used in the "Up or Down" variants)
	if c.Rank == 0 {
		return false
	}

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

// IsDead returns true if all the copies of some previous rank have been discarded,
// so it is no longer possible to play this card
func (c *Card) IsDead(g *Game) bool {
	if !strings.HasPrefix(g.Options.Variant, "Up or Down") || g.StackDirections[c.Suit] == stackDirectionUp {
		// This is a "normal" variant where the cards play in order
		// (or this is a stack going upward in an "Up or Down" variant)
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
	} else {
		// This is a stack going downward in an "Up or Down" variant
		for i := 5; i > c.Rank; i-- {
			if i == 0 {
				break
			}

			// Start with the 5, then the 4s, etc., checking to see if they are all discarded
			totalCardsNotDiscarded := 2
			if i == 1 || i == 5 {
				totalCardsNotDiscarded = 1
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
	}

	return false
}
