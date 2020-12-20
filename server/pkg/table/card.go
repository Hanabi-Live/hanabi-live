package table

import (
	"strconv"

	"github.com/Zamiell/hanabi-live/server/pkg/variants"
)

type card struct {
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

func newCard(suitIndex int, rank int) *card {
	c := &card{}

	// We can't set the order here because the deck will be shuffled later
	c.SuitIndex = suitIndex
	c.Rank = rank

	return c
}

func (c *card) name(g *game) string {
	suit := g.Variant.Suits[c.SuitIndex]
	name := suit.Name
	name += " "
	if c.Rank == variants.StartCardRank {
		name += "START"
	} else {
		name += strconv.Itoa(c.Rank)
	}
	return name
}
