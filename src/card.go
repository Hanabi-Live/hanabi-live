package main

type Card struct {
	Order     int
	Suit      int
	Rank      int
	Touched   bool
	Slot      int // Only written when the card is played or discarded
	Failed    bool
	Discarded bool
}

func (c *Card) SuitName(g *Game) string {
	name := suits[c.Suit]

	if (g.Options.Variant == 1 || g.Options.Variant == 10) && c.Suit == 5 {
		// Change "Black" to "Orange"
		name = suits[8]
	} else if g.Options.Variant == 3 && c.Suit == 5 {
		// Change "Black" to "Rainbow"
		name = suits[6]
	} else if g.Options.Variant == 4 {
		// Set the "Mixed Suits" text
		name = mixedSuits[c.Suit]
	} else if g.Options.Variant == 5 {
		// Set the "Dual & Rainbow Suits" text
		name = mmSuits[c.Suit]
	} else if g.Options.Variant == 6 && c.Suit == 4 {
		// Change "Purple" to "White"
		name = suits[7]
	} else if (g.Options.Variant == 6 || g.Options.Variant == 11) && c.Suit == 5 {
		// Change "Black" to "Rainbow"
		name = suits[6]
	} else if g.Options.Variant == 7 {
		// Set the "Wild & Crazy" suits text
		name = crazySuits[c.Suit]
	} else if g.Options.Variant == 8 {
		// Set the "Ambiguous Suits" text
		name = ambiguousSuits[c.Suit]
	} else if g.Options.Variant == 9 {
		// Set the "Blue & Red Suits" text
		name = blueRedSuits[c.Suit]
	}

	return name
}
