package main

import (
	"time"
)

var (
	startingTime = 2 * time.Minute  // The amount of time that each player starts with
	timePerTurn  = 20 * time.Second // The amount of extra time a player gets after making a move

	suits = []string{
		"Blue",
		"Green",
		"Yellow",
		"Red",
		"Purple",
		"Black",
		"Rainbow",
		"White",
	}
	mixedSuits = []string{
		"Green",
		"Purple",
		"Navy",
		"Orange",
		"Tan",
		"Burgundy",
	}
	mixedClues = []string{
		"Blue",
		"Yellow",
		"Red",
		"Black",
	}
	mmSuits = []string{
		"Teal",
		"Lime",
		"Orange",
		"Cardinal",
		"Indigo",
		"Rainbow",
	}
	crazySuits = []string{
		"Green",
		"Purple",
		"Orange",
		"White",
		"Rainbow",
		"Black",
	}
	variants = []string{
		"No Variant",
		"Black Suit",
		"Black Suit 1oE",
		"Rainbow Suit",
		"Dual-color Suits",
		"Dual-color & Rainbow Suits",
		"White Suit & Rainbow Suit",
		"Wild & Crazy",
	}
	variantsShort = []string{
		"No Variant",
		"Black",
		"Black (1oE)",
		"Rainbow",
		"Dual-color",
		"Dual & Rainbow",
		"White & Rainbow",
		"Wild & Crazy",
	}
)
