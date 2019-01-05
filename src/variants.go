package main

import (
	"strconv"
	"strings"
)

/*
	Data types
*/

type Variant struct {
	ID int
	// Each variant must have a unique numerical ID for seed generation purposes
	// Prior to January 2019, variants were identified as number instead of name
	// For variants created prior to this date, the ID also doubles as the original numerical identifier
	Suits []Suit
	Clues []ColorClue
}

type Suit struct {
	Name            string
	ColorsTouchedBy []ColorClue
	IsOneOfEach     bool
}

type ColorClue struct {
	Name string
}

func NewSuit(name string, colorsTouchedBy []ColorClue) Suit {
	return Suit{
		Name:            name,
		ColorsTouchedBy: colorsTouchedBy,
		IsOneOfEach:     false,
	}
}

func NewSuit1oE(name string, colorsTouchedBy []ColorClue) Suit {
	return Suit{
		Name:            name,
		ColorsTouchedBy: colorsTouchedBy,
		IsOneOfEach:     true,
	}
}

// Clues
var (
	BlueClue   = ColorClue{Name: "Blue"}
	GreenClue  = ColorClue{Name: "Green"}
	YellowClue = ColorClue{Name: "Yellow"}
	RedClue    = ColorClue{Name: "Red"}
	PurpleClue = ColorClue{Name: "Purple"}
	OrangeClue = ColorClue{Name: "Orange"}
	BlackClue  = ColorClue{Name: "Black"}

	// Helpers used for some variants
	allColorClues = []ColorClue{BlueClue, GreenClue, YellowClue, RedClue, PurpleClue, OrangeClue, BlackClue}
	noColorClues  = []ColorClue{}
)

// Suits
// (can use "allColorClues" or "noColorClues" as the second argument for brevity)
var (
	// The base game
	BlueSuit   = NewSuit("Blue", []ColorClue{BlueClue})
	GreenSuit  = NewSuit("Green", []ColorClue{GreenClue})
	YellowSuit = NewSuit("Yellow", []ColorClue{YellowClue})
	RedSuit    = NewSuit("Red", []ColorClue{RedClue})
	PurpleSuit = NewSuit("Purple", []ColorClue{PurpleClue})

	// Basic variants
	OrangeSuit     = NewSuit("Orange", []ColorClue{OrangeClue})
	BlackSuit      = NewSuit1oE("Black", []ColorClue{BlackClue})
	RainbowSuit    = NewSuit("Rainbow", allColorClues)
	WhiteSuit      = NewSuit("White", noColorClues)
	Rainbow1oESuit = NewSuit1oE("Rainbow", allColorClues)

	// For "Dual-Color (6 Suits)"
	GreenDualSuit    = NewSuit("Green", []ColorClue{BlueClue, YellowClue})
	PurpleDualSuit   = NewSuit("Purple", []ColorClue{RedClue, BlueClue})
	NavyDualSuit     = NewSuit("Navy", []ColorClue{BlackClue, BlueClue})
	OrangeDualSuit   = NewSuit("Orange", []ColorClue{YellowClue, RedClue})
	TanDualSuit      = NewSuit("Tan", []ColorClue{BlackClue, YellowClue})
	BurgundyDualSuit = NewSuit("Burgundy", []ColorClue{BlackClue, RedClue})

	// For "Dual-Color (5 Suits)"
	TealDualSuit = NewSuit("Teal", []ColorClue{BlueClue, GreenClue})
	LimeDualSuit = NewSuit("Lime", []ColorClue{YellowClue, GreenClue})
	// OrangeDualSuit is reused
	CardinalDualSuit = NewSuit("Cardinal", []ColorClue{RedClue, PurpleClue})
	IndigoDualSuit   = NewSuit("Indigo", []ColorClue{BlueClue, PurpleClue})

	// For "Ambiguous"
	SkySuit      = NewSuit("Sky", []ColorClue{BlueClue})
	NavySuit     = NewSuit("Navy", []ColorClue{BlueClue})
	LimeSuit     = NewSuit("Lime", []ColorClue{GreenClue})
	ForestSuit   = NewSuit("Forest", []ColorClue{GreenClue})
	TomatoSuit   = NewSuit("Tomato", []ColorClue{RedClue})
	MahoganySuit = NewSuit("Mahogany", []ColorClue{RedClue})

	// For "Very Ambiguous"
	BerrySuit = NewSuit("Berry", []ColorClue{BlueClue})
	RubySuit  = NewSuit("Ruby", []ColorClue{RedClue})

	// For "Color Blind"
	BlindBlueSuit   = NewSuit("Blue", noColorClues)
	BlindGreenSuit  = NewSuit("Green", noColorClues)
	BlindYellowSuit = NewSuit("Yellow", noColorClues)
	BlindRedSuit    = NewSuit("Red", noColorClues)
	BlindPurpleSuit = NewSuit("Purple", noColorClues)
	BlindOrangeSuit = NewSuit("Orange", noColorClues)
)

// Variants
var (
	variants   map[string]Variant
	variantsID map[int]string
)

func variantsInit() {
	variants = map[string]Variant{
		// Normal
		"No Variant": Variant{
			ID:    0,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, PurpleSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue, PurpleClue},
		},
		"Six Suits": Variant{
			ID:    1,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, PurpleSuit, OrangeSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue, PurpleClue, OrangeClue},
		},
		"Four Suits": Variant{
			ID:    15,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue},
		},
		"Three Suits": Variant{
			ID:    18,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue},
		},

		// White
		"White (6 Suits)": Variant{
			ID:    13,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, PurpleSuit, WhiteSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue, PurpleClue},
		},
		"White (5 Suits)": Variant{
			ID:    22,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, WhiteSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue},
		},
		"White (4 Suits)": Variant{
			ID:    26,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, WhiteSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue},
		},
		"White (3 Suits)": Variant{
			ID:    27,
			Suits: []Suit{BlueSuit, GreenSuit, WhiteSuit},
			Clues: []ColorClue{BlueClue, GreenClue},
		},

		// Black
		"Black (6 Suits)": Variant{
			ID:    2,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, PurpleSuit, BlackSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue, PurpleClue, BlackClue},
		},
		"Black (5 Suits)": Variant{
			ID:    21,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, BlackSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue, BlackClue},
		},
		// "Black (4 Suits)" would be too difficult

		// Rainbow
		"Rainbow (6 Suits)": Variant{
			ID:    3,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, PurpleSuit, RainbowSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue, PurpleClue},
		},
		"Rainbow (5 Suits)": Variant{
			ID:    16,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, RainbowSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue},
		},
		"Rainbow (4 Suits)": Variant{
			ID:    17,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RainbowSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue},
		},
		"Rainbow (3 Suits)": Variant{
			ID:    19,
			Suits: []Suit{BlueSuit, GreenSuit, RainbowSuit},
			Clues: []ColorClue{BlueClue, GreenClue},
		},

		// White & Rainbow
		"White & Rainbow (6 Suits)": Variant{
			ID:    6,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, WhiteSuit, RainbowSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue},
		},
		"White & Rainbow (5 Suits)": Variant{
			ID:    28,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, WhiteSuit, RainbowSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue},
		},
		"White & Rainbow (4 Suits)": Variant{
			ID:    29,
			Suits: []Suit{BlueSuit, GreenSuit, WhiteSuit, RainbowSuit},
			Clues: []ColorClue{BlueClue, GreenClue},
		},

		// Dark Rainbow
		"Dark Rainbow (6 Suits)": Variant{
			ID:    11,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, PurpleSuit, Rainbow1oESuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue, PurpleClue},
		},
		"Dark Rainbow (5 Suits)": Variant{
			ID:    23,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, Rainbow1oESuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue},
		},
		// "Dark Rainbow (4 Suits)" would be too difficult
		"Black & Dark Rainbow (6 Suits)": Variant{
			ID:    12,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, BlackSuit, Rainbow1oESuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue, BlackClue},
		},
		// "Black & Dark Rainbow (5 Suits)" would be too difficult

		// Color Blind
		"Color Blind (6 Suits)": Variant{
			ID:    10,
			Suits: []Suit{BlindBlueSuit, BlindGreenSuit, BlindYellowSuit, BlindRedSuit, BlindPurpleSuit, BlindOrangeSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue, PurpleClue, OrangeClue},
		},
		"Color Blind (5 Suits)": Variant{
			ID:    33,
			Suits: []Suit{BlindBlueSuit, BlindGreenSuit, BlindYellowSuit, BlindRedSuit, BlindPurpleSuit, BlindOrangeSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue, PurpleClue, OrangeClue},
		},
		"Color Blind (4 Suits)": Variant{
			ID:    34,
			Suits: []Suit{BlindBlueSuit, BlindGreenSuit, BlindYellowSuit, BlindRedSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue},
		},
		"Color Blind (3 Suits)": Variant{
			ID:    35,
			Suits: []Suit{BlindBlueSuit, BlindGreenSuit, BlindYellowSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue},
		},

		// Ambiguous
		"Ambiguous (6 Suits)": Variant{
			ID:    8,
			Suits: []Suit{SkySuit, NavySuit, LimeSuit, ForestSuit, TomatoSuit, MahoganySuit},
			Clues: []ColorClue{BlueClue, GreenClue, RedClue},
		},
		"Very Ambiguous (6 Suits)": Variant{
			ID:    9,
			Suits: []Suit{SkySuit, BerrySuit, NavySuit, TomatoSuit, RubySuit, MahoganySuit},
			Clues: []ColorClue{BlueClue, RedClue},
		},
		"Very Ambiguous (4 Suits)": Variant{
			ID:    30,
			Suits: []Suit{SkySuit, NavySuit, TomatoSuit, MahoganySuit},
			Clues: []ColorClue{BlueClue, RedClue},
		},
		"Very Ambiguous & White (5 Suits)": Variant{
			ID:    31,
			Suits: []Suit{SkySuit, NavySuit, TomatoSuit, MahoganySuit, WhiteSuit},
			Clues: []ColorClue{BlueClue, RedClue},
		},
		"Very Ambiguous & Rainbow (5 Suits)": Variant{
			ID:    32,
			Suits: []Suit{SkySuit, NavySuit, TomatoSuit, MahoganySuit, RainbowSuit},
			Clues: []ColorClue{BlueClue, RedClue},
		},

		// Dual-Color
		"Dual-Color (6 Suits)": Variant{
			ID:    4,
			Suits: []Suit{GreenDualSuit, PurpleDualSuit, NavyDualSuit, OrangeDualSuit, TanDualSuit, BurgundyDualSuit},
			Clues: []ColorClue{BlueClue, YellowClue, RedClue, BlackClue},
		},
		"Dual-Color (5 Suits)": Variant{
			ID:    36,
			Suits: []Suit{TealDualSuit, LimeDualSuit, OrangeDualSuit, CardinalDualSuit, IndigoDualSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue, PurpleClue},
		},
		"Dual-Color (3 Suits)": Variant{
			ID:    37,
			Suits: []Suit{GreenDualSuit, PurpleDualSuit, OrangeDualSuit},
			Clues: []ColorClue{BlueClue, YellowClue, RedClue},
		},
		"Dual-Color & Rainbow (6 Suits)": Variant{
			ID:    5,
			Suits: []Suit{TealDualSuit, LimeDualSuit, OrangeDualSuit, CardinalDualSuit, IndigoDualSuit, RainbowSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue, PurpleClue},
		},
		"Dual-Color & Rainbow (4 Suits)": Variant{
			ID:    38,
			Suits: []Suit{GreenDualSuit, PurpleDualSuit, OrangeDualSuit, RainbowSuit},
			Clues: []ColorClue{BlueClue, YellowClue, RedClue},
		},

		// Multi-Fives
		"Multi-Fives (6 Suits)": Variant{
			ID:    45,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, PurpleSuit, OrangeSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue, PurpleClue, OrangeClue},
		},
		"Multi-Fives (5 Suits)": Variant{
			ID:    46,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, PurpleSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue, PurpleClue},
		},
		"Multi-Fives (4 Suits)": Variant{
			ID:    49,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue},
		},
		"Multi-Fives (3 Suits)": Variant{
			ID:    50,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue},
		},
		"Multi-Fives & Rainbow (6 Suits)": Variant{
			ID:    39,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, PurpleSuit, RainbowSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue, PurpleClue},
		},
		"Multi-Fives & Rainbow (5 Suits)": Variant{
			ID:    14,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, RainbowSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue},
		},
		"Multi-Fives & Rainbow (4 Suits)": Variant{
			ID:    47,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RainbowSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue},
		},
		"Multi-Fives & Rainbow (3 Suits)": Variant{
			ID:    48,
			Suits: []Suit{BlueSuit, GreenSuit, RainbowSuit},
			Clues: []ColorClue{BlueClue, GreenClue},
		},

		// Up or Down
		"Up or Down (6 Suits)": Variant{
			ID:    40,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, PurpleSuit, OrangeSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue, PurpleClue, OrangeClue},
		},
		"Up or Down (5 Suits)": Variant{
			ID:    24,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, PurpleSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue, PurpleClue},
		},
		// "Up or Down (4 Suits)" is too difficult
		"Up or Down & White (6 Suits)": Variant{
			ID:    41,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, PurpleSuit, WhiteSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue, PurpleClue},
		},
		"Up or Down & White (5 Suits)": Variant{
			ID:    42,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, WhiteSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue},
		},
		"Up or Down & Rainbow (6 Suits)": Variant{
			ID:    25,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, PurpleSuit, RainbowSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue, PurpleClue},
		},
		"Up or Down & Rainbow (5 Suits)": Variant{
			ID:    43,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, PurpleSuit, RainbowSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue, PurpleClue},
		},
		"Up or Down & White & Rainbow (6 Suits)": Variant{
			ID:    44,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, WhiteSuit, RainbowSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue},
		},

		// Mixed
		"African American": Variant{
			ID:    20,
			Suits: []Suit{TomatoSuit, MahoganySuit, WhiteSuit, SkySuit, NavySuit, BlackSuit},
			Clues: []ColorClue{BlueClue, RedClue, BlackClue},
		},
		"Wild & Crazy": Variant{
			ID:    7,
			Suits: []Suit{GreenDualSuit, PurpleDualSuit, OrangeDualSuit, WhiteSuit, RainbowSuit, BlackSuit},
			Clues: []ColorClue{BlueClue, YellowClue, RedClue, BlackClue},
		},
	}

	// Validate that all of the ID's are unique
	for variantName, variant := range variants {
		for variantName2, variant2 := range variants {
			if variantName == variantName2 {
				continue
			}
			if variant.ID == variant2.ID {
				log.Fatal("Variant \"" + variantName + "\" and \"" + variantName2 + "\" have the same ID (" + strconv.Itoa(variant.ID) + ").")
			}
		}
	}

	// Populate a reverse mapping of ID to variant name
	variantsID = make(map[int]string)
	for variantName, variant := range variants {
		variantsID[variant.ID] = variantName
	}
}

// variantIsCardTouched returns true if a color clue will touch a particular suit
// For example, a yellow clue will not touch a green card in a normal game, but it will in "Dual-color Suits"
func variantIsCardTouched(variant string, clue Clue, card *Card) bool {
	if clue.Type == clueTypeNumber {
		return card.Rank == clue.Value || (strings.HasPrefix(variant, "Multi-Fives") && card.Rank == 5)
	} else if clue.Type == clueTypeColor {
		return isCluedBy(variants[variant].Suits[card.Suit].ColorsTouchedBy, variants[variant].Clues[clue.Value])
	}

	return false
}

// isCluedBy returns true if the ColorClue is in the list
func isCluedBy(list []ColorClue, item ColorClue) bool {
	if len(list) == 0 {
		return false
	}
	for _, b := range list {
		if item.Name == b.Name {
			return true
		}
	}
	return false
}

func variantIsClueLegal(variant string, clue Clue) bool {
	// You are not allowed to clue number 5 in the "Multi-Fives" variants
	if strings.HasPrefix(variant, "Multi-Fives") && clue.Type == clueTypeNumber && clue.Value == 5 {
		return false
	}

	return true
}
