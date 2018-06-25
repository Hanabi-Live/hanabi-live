package main

import "strconv"

type Card struct {
	Order     int
	Suit      int
	Rank      int
	Touched   bool
	Slot      int // Written/assigned after the deck is shuffled
	Failed    bool
	Discarded bool
}

func (c *Card) Name(g *Game) string {
	return variantGetSuitName(g.Options.Variant, c.Suit) + " " + strconv.Itoa(c.Rank)
}
