package table

import (
	"strconv"

	"github.com/Zamiell/hanabi-live/server/pkg/variants"
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
		Order:            0, // We can't set the order here because the deck will be shuffled later
		SuitIndex:        suit,
		Rank:             rank,
		Slot:             0,
		Touched:          false,
		Discarded:        false,
		Played:           false,
		Failed:           false,
		CannotBePlayed:   false,
		InsistentTouched: false,
	}

	return c
}

func (c *Card) Name(g *Game) string {
	var variant *variants.Variant
	if v, ok := g.Table.variantsManager.Variants[g.Options.VariantName]; !ok {
		return "Unknown"
	} else {
		variant = v
	}

	suit := variant.Suits[c.SuitIndex]
	name := suit.Name
	name += " "
	if c.Rank == variants.StartCardRank {
		name += "START"
	} else {
		name += strconv.Itoa(c.Rank)
	}
	return name
}
