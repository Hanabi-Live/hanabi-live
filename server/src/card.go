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
