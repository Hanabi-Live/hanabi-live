package main

var (
	variants = []string{
		"No Variant",            // 0
		"Orange",                // 1
		"Black (1oE)",           // 2
		"Rainbow",               // 3
		"Dual-color",            // 4
		"Dual & Rainbow",        // 5
		"White & Rainbow",       // 6
		"Wild & Crazy",          // 7
		"Ambiguous",             // 8
		"Blue & Red",            // 9
		"Acid Trip",             // 10
		"Rainbow (1oE)",         // 11
		"Black & Rainbow (1oE)", // 12
	}
)

func variantIsSuit1oE(variant int, suit int) bool {
	if suit == 5 && (variant == 2 || variant == 7 || variant == 11) {
		// "Black (1oE)", "Wild & Crazy"
		return true
	} else if (suit == 4 || suit == 5) && variant == 12 {
		// "Black & Rainbow (1oE)"
		return true
	}

	return false
}

func variantIsCardTouched(variant int, clue int, suit int) bool {
	if variant >= 0 && variant <= 2 {
		// Normal, Orange, and Black (1oE)
		if clue == suit {
			return true
		}
	} else if variant == 3 || variant == 6 || variant == 11 || variant == 12 {
		// Rainbow, White & Rainbow, Rainbow (1oE), Black & Rainbow (1oE)
		if clue == suit || suit == 5 {
			return true
		}
	} else if variant == 4 {
		// Mixed suits
		// 0 - Green    (Blue   / Yellow)
		// 1 - Purple   (Blue   / Red)
		// 2 - Navy     (Blue   / Black)
		// 3 - Orange   (Yellow / Red)
		// 4 - Tan      (Yellow / Black)
		// 5 - Burgundy (Red    / Black)
		if clue == 0 {
			// Blue clue
			if suit == 0 || suit == 1 || suit == 2 {
				return true
			}
		} else if clue == 1 {
			// Green clue
			if suit == 0 || suit == 3 || suit == 4 {
				return true
			}
		} else if clue == 2 {
			// Red clue
			if suit == 1 || suit == 3 || suit == 5 {
				return true
			}
		} else if clue == 3 {
			// Purple clue
			if suit == 2 || suit == 4 || suit == 5 {
				return true
			}
		}
	} else if variant == 5 {
		// Mixed and multi suits
		// 0 - Teal     (Blue / Green)
		// 1 - Lime     (Green / Yellow)
		// 2 - Orange   (Yellow / Red)
		// 3 - Cardinal (Red / Purple)
		// 4 - Indigo   (Purple / Blue)
		// 5 - Rainbow
		if clue == 0 {
			// Blue clue
			if suit == 0 || suit == 4 || suit == 5 {
				return true
			}
		} else if clue == 1 {
			// Green clue
			if suit == 0 || suit == 1 || suit == 5 {
				return true
			}
		} else if clue == 2 {
			// Yellow clue
			if suit == 1 || suit == 2 || suit == 5 {
				return true
			}
		} else if clue == 3 {
			// Red clue
			if suit == 2 || suit == 3 || suit == 5 {
				return true
			}
		} else if clue == 4 {
			// Black clue
			if suit == 3 || suit == 4 || suit == 5 {
				return true
			}
		}
	} else if variant == 7 {
		// Wild & Crazy
		// 0 - Green   (Blue   / Yellow)
		// 1 - Purple  (Blue   / Red)
		// 2 - Orange  (Yellow / Red)
		// 3 - White
		// 4 - Rainbow
		// 5 - Black
		if clue == 0 {
			// Blue clue
			if suit == 0 || suit == 1 || suit == 4 {
				return true
			}
		} else if clue == 1 {
			// Yellow clue
			if suit == 0 || suit == 2 || suit == 4 {
				return true
			}
		} else if clue == 2 {
			// Red clue
			if suit == 1 || suit == 2 || suit == 4 {
				return true
			}
		} else if clue == 3 {
			// Black clue
			if suit == 4 || suit == 5 {
				return true
			}
		}
	} else if variant == 8 {
		// Ambiguous Suits
		// 0 - Blue
		// 1 - Green
		// 2 - Blue
		if clue == 0 {
			// Blue clue
			if suit == 0 || suit == 1 {
				return true
			}
		} else if clue == 1 {
			// Green clue
			if suit == 2 || suit == 3 {
				return true
			}
		} else if clue == 2 {
			// Red clue
			if suit == 4 || suit == 5 {
				return true
			}
		}
	} else if variant == 9 {
		// Blue & Red Suits
		// 0 - Blue
		// 1 - Red
		if clue == 0 {
			// Blue clue
			if suit == 0 || suit == 1 || suit == 2 {
				return true
			}
		} else if clue == 1 {
			// Green clue
			if suit == 3 || suit == 4 || suit == 5 {
				return true
			}
		}
	} else if variant == 10 {
		// Acid Trip
		return false
	}

	return false
}

var (
	suits = []string{
		"Blue",
		"Green",
		"Yellow",
		"Red",
		"Purple",
		"Orange",
		"Black",
		"Rainbow",
		"White",
	}
	dcSuits = []string{
		"Green",
		"Purple",
		"Navy",
		"Orange",
		"Tan",
		"Burgundy",
	}
	dcrSuits = []string{
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
	blueRedSuits = []string{
		"Sky",
		"Berry",
		"Navy",
		"Tomato",
		"Ruby",
		"Mahogany",
	}
)

func variantGetSuitName(variant int, suit int) string {
	name := suits[suit]

	if variant == 2 && suit == 5 {
		// "Black (1oE)"
		// Change "Orange" to "Black"
		name = suits[6]
	} else if (variant == 3 || variant == 6 || variant == 11) && suit == 5 {
		// "Rainbow", "White & Rainbow", and "Rainbow (1oE)"
		// Change "Orange" to "Rainbow"
		name = suits[7]
	} else if variant == 4 {
		// "Dual-color"
		name = dcSuits[suit]
	} else if variant == 5 {
		// "Dual & Rainbow"
		name = dcrSuits[suit]
	} else if variant == 6 && suit == 4 {
		// "White & Rainbow"
		// Change "Purple" to "White"
		name = suits[8]
	} else if variant == 7 {
		// "Wild & Crazy"
		name = crazySuits[suit]
	} else if variant == 8 {
		// "Ambiguous"
		name = ambiguousSuits[suit]
	} else if variant == 9 {
		// "Blue & Red"
		name = blueRedSuits[suit]
	} else if variant == 12 {
		// "Black & Rainbow (1oE)"
		if suit == 4 {
			// Change "Purple" to "Black"
			name = suits[6]
		} else if suit == 5 {
			// Change "Black" to "Rainbow"
			name = suits[7]
		}
	}

	return name
}

var (
	dcClues = []string{
		"Blue",
		"Yellow",
		"Red",
		"Black",
	}
	ambiguousClues = []string{
		"Blue",
		"Green",
		"Red",
	}
	blueRedClues = []string{
		"Blue",
		"Red",
	}
)

func variantGetClueName(variant int, clue int) string {
	if variant == 2 && clue == 5 {
		// "Black (1oE)"
		// Change "Orange" to "Black"
		return suits[6]
	} else if variant == 4 || variant == 7 {
		// "Dual-color" & "Wild & Crazy"
		return dcClues[clue]
	} else if variant == 8 {
		// "Ambiguous"
		return ambiguousClues[clue]
	} else if variant == 9 {
		// "Blue & Red"
		return blueRedClues[clue]
	} else if variant == 12 && clue == 4 {
		// "Black & Rainbow (1oE)"
		// Change "Purple" to "Black"
		return suits[6]
	} else {
		return suits[clue]
	}
}
