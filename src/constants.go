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
		"Orange",
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
	ambiguousSuits = []string{
		"Sky",
		"Navy",
		"Lime",
		"Forest",
		"Tomato",
		"Burgundy",
	}
	ambiguousClues = []string{
		"Blue",
		"Green",
		"Red",
	}
	blueRedSuits = []string{
		"Sky",
		"Berry",
		"Navy",
		"Tomato",
		"Ruby",
		"Mahogany",
	}
	blueRedClues = []string{
		"Blue",
		"Red",
	}
	variants = []string{
		"No Variant",
		"Orange",
		"Black (1oE)",
		"Rainbow",
		"Dual-color",
		"Dual & Rainbow",
		"White & Rainbow",
		"Wild & Crazy",
		"Ambiguous",
		"Blue & Red",
		"Acid Trip",
	}
)
