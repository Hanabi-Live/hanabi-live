package main

import (
	"strconv"
)

type Card struct {
	Order     int // Assigned after the deck is shuffled
	SuitIndex int
	Rank      int
	Slot      int // Assigned after the card is removed from a player's hand
	Touched   bool
	Discarded bool
	Played    bool
	Failed    bool
	// After a player takes their final turn,
	// all of the remaining cards in their hand are marked with the following bool
	CannotBePlayed   bool
	InsistentTouched bool // Used by the "Insistent" character
}

func NewCard(suit int, rank int) *Card {
	c := &Card{
		SuitIndex: suit,
		Rank:      rank,
		// We can't set the order here because the deck will be shuffled later
	}

	return c
}

func (c *Card) Name(g *Game) string {
	variant := variants[g.Options.VariantName]
	suit := variant.Suits[c.SuitIndex]
	name := suit.Name
	name += " "
	if c.Rank == StartCardRank {
		name += "START"
	} else {
		name += strconv.Itoa(c.Rank)
	}
	return name
}

// NeedsToBePlayed returns true if the card is not yet played
// and is still needed to be played in order to get the maximum score
func (c *Card) NeedsToBePlayed(g *Game) bool {
	// First, check to see if a copy of this card has already been played
	for _, c2 := range g.Deck {
		if c2.SuitIndex == c.SuitIndex &&
			c2.Rank == c.Rank &&
			c2.Played {

			return false
		}
	}

	// Determining if the card needs to be played in the "Up or Down" variants is more complicated
	if variants[g.Options.VariantName].HasReversedSuits() {
		return variantReversibleNeedsToBePlayed(g, c)
	}

	// Second, check to see if it is still possible to play this card
	// (the preceding cards in the suit might have already been discarded)
	for i := 1; i < c.Rank; i++ {
		total, discarded := g.GetSpecificCardNum(c.SuitIndex, i)
		if total == discarded {
			// The suit is "dead", so this card does not need to be played anymore
			return false
		}
	}

	// By default, all cards not yet played will need to be played
	return true
}
