package main

import (
	"strconv"
	"strings"
)

/*
	Data types
*/

type Variant struct {
	Name string
	ID   int
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

	// For "Color Blind"
	BlindBlueSuit   = NewSuit("Blue", noColorClues)
	BlindGreenSuit  = NewSuit("Green", noColorClues)
	BlindYellowSuit = NewSuit("Yellow", noColorClues)
	BlindRedSuit    = NewSuit("Red", noColorClues)
	BlindPurpleSuit = NewSuit("Purple", noColorClues)
	BlindOrangeSuit = NewSuit("Orange", noColorClues)

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

	// For "Dual-Color (6 Suits)"
	GreenDualSuit    = NewSuit("Green", []ColorClue{BlueClue, YellowClue})
	PurpleDualSuit   = NewSuit("Purple", []ColorClue{RedClue, BlueClue})
	NavyDualSuit     = NewSuit("Navy", []ColorClue{BlackClue, BlueClue})
	OrangeDualSuit   = NewSuit("Orange", []ColorClue{YellowClue, RedClue})
	TanDualSuit      = NewSuit("Tan", []ColorClue{BlackClue, YellowClue})
	MahoganyDualSuit = NewSuit("Mahogany", []ColorClue{BlackClue, RedClue})

	// For "Dual-Color (5 Suits)"
	TealDualSuit = NewSuit("Teal", []ColorClue{BlueClue, GreenClue})
	LimeDualSuit = NewSuit("Lime", []ColorClue{YellowClue, GreenClue})
	// OrangeDualSuit is reused
	CardinalDualSuit = NewSuit("Cardinal", []ColorClue{RedClue, PurpleClue})
	IndigoDualSuit   = NewSuit("Indigo", []ColorClue{BlueClue, PurpleClue})
)

// Variants
var (
	variantDefinitions []Variant
	variants           map[string]Variant
	variantsID         map[int]string
)

func variantsInit() {
	variantDefinitions = []Variant{
		// Normal
		Variant{
			Name:  "No Variant",
			ID:    0,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, PurpleSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue, PurpleClue},
		},
		Variant{
			Name:  "Six Suits",
			ID:    1,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, PurpleSuit, OrangeSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue, PurpleClue, OrangeClue},
		},
		Variant{
			Name:  "Four Suits",
			ID:    15,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue},
		},
		Variant{
			Name:  "Three Suits",
			ID:    18,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue},
		},

		// White
		Variant{
			Name:  "White (6 Suits)",
			ID:    13,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, PurpleSuit, WhiteSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue, PurpleClue},
		},
		Variant{
			Name:  "White (5 Suits)",
			ID:    22,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, WhiteSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue},
		},
		Variant{
			Name:  "White (4 Suits)",
			ID:    26,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, WhiteSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue},
		},
		Variant{
			Name:  "White (3 Suits)",
			ID:    27,
			Suits: []Suit{BlueSuit, GreenSuit, WhiteSuit},
			Clues: []ColorClue{BlueClue, GreenClue},
		},

		// Black
		Variant{
			Name:  "Black (6 Suits)",
			ID:    2,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, PurpleSuit, BlackSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue, PurpleClue, BlackClue},
		},
		Variant{
			Name:  "Black (5 Suits)",
			ID:    21,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, BlackSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue, BlackClue},
		},
		// "Black (4 Suits)" would be too difficult

		// Rainbow
		Variant{
			Name:  "Rainbow (6 Suits)",
			ID:    3,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, PurpleSuit, RainbowSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue, PurpleClue},
		},
		Variant{
			Name:  "Rainbow (5 Suits)",
			ID:    16,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, RainbowSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue},
		},
		Variant{
			Name:  "Rainbow (4 Suits)",
			ID:    17,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RainbowSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue},
		},
		Variant{
			Name:  "Rainbow (3 Suits)",
			ID:    19,
			Suits: []Suit{BlueSuit, GreenSuit, RainbowSuit},
			Clues: []ColorClue{BlueClue, GreenClue},
		},

		// White & Rainbow
		Variant{
			Name:  "White & Rainbow (6 Suits)",
			ID:    6,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, WhiteSuit, RainbowSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue},
		},
		Variant{
			Name:  "White & Rainbow (5 Suits)",
			ID:    28,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, WhiteSuit, RainbowSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue},
		},
		Variant{
			Name:  "White & Rainbow (4 Suits)",
			ID:    29,
			Suits: []Suit{BlueSuit, GreenSuit, WhiteSuit, RainbowSuit},
			Clues: []ColorClue{BlueClue, GreenClue},
		},

		// Dark Rainbow
		Variant{
			Name:  "Dark Rainbow (6 Suits)",
			ID:    11,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, PurpleSuit, Rainbow1oESuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue, PurpleClue},
		},
		Variant{
			Name:  "Dark Rainbow (5 Suits)",
			ID:    23,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, Rainbow1oESuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue},
		},
		// "Dark Rainbow (4 Suits)" would be too difficult
		Variant{
			Name:  "Black & Dark Rainbow (6 Suits)",
			ID:    12,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, BlackSuit, Rainbow1oESuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue, BlackClue},
		},
		// "Black & Dark Rainbow (5 Suits)" would be too difficult

		// Color Blind
		Variant{
			Name:  "Color Blind (6 Suits)",
			ID:    10,
			Suits: []Suit{BlindBlueSuit, BlindGreenSuit, BlindYellowSuit, BlindRedSuit, BlindPurpleSuit, BlindOrangeSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue, PurpleClue, OrangeClue},
		},
		Variant{
			Name:  "Color Blind (5 Suits)",
			ID:    33,
			Suits: []Suit{BlindBlueSuit, BlindGreenSuit, BlindYellowSuit, BlindRedSuit, BlindPurpleSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue, PurpleClue},
		},
		Variant{
			Name:  "Color Blind (4 Suits)",
			ID:    34,
			Suits: []Suit{BlindBlueSuit, BlindGreenSuit, BlindYellowSuit, BlindRedSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue},
		},
		Variant{
			Name:  "Color Blind (3 Suits)",
			ID:    35,
			Suits: []Suit{BlindBlueSuit, BlindGreenSuit, BlindYellowSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue},
		},

		// Ambiguous
		Variant{
			Name:  "Ambiguous (6 Suits)",
			ID:    8,
			Suits: []Suit{SkySuit, NavySuit, LimeSuit, ForestSuit, TomatoSuit, MahoganySuit},
			Clues: []ColorClue{BlueClue, GreenClue, RedClue},
		},
		Variant{
			Name:  "Very Ambiguous (6 Suits)",
			ID:    9,
			Suits: []Suit{SkySuit, BerrySuit, NavySuit, TomatoSuit, RubySuit, MahoganySuit},
			Clues: []ColorClue{BlueClue, RedClue},
		},
		Variant{
			Name:  "Very Ambiguous (4 Suits)",
			ID:    30,
			Suits: []Suit{SkySuit, NavySuit, TomatoSuit, MahoganySuit},
			Clues: []ColorClue{BlueClue, RedClue},
		},
		Variant{
			Name:  "Very Ambiguous & White (5 Suits)",
			ID:    31,
			Suits: []Suit{SkySuit, NavySuit, TomatoSuit, MahoganySuit, WhiteSuit},
			Clues: []ColorClue{BlueClue, RedClue},
		},
		Variant{
			Name:  "Very Ambiguous & Rainbow (5 Suits)",
			ID:    32,
			Suits: []Suit{SkySuit, NavySuit, TomatoSuit, MahoganySuit, RainbowSuit},
			Clues: []ColorClue{BlueClue, RedClue},
		},

		// Dual-Color
		Variant{
			Name:  "Dual-Color (6 Suits)",
			ID:    4,
			Suits: []Suit{GreenDualSuit, PurpleDualSuit, NavyDualSuit, OrangeDualSuit, TanDualSuit, MahoganyDualSuit},
			Clues: []ColorClue{BlueClue, YellowClue, RedClue, BlackClue},
		},
		Variant{
			Name:  "Dual-Color (5 Suits)",
			ID:    36,
			Suits: []Suit{TealDualSuit, LimeDualSuit, OrangeDualSuit, CardinalDualSuit, IndigoDualSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue, PurpleClue},
		},
		Variant{
			Name:  "Dual-Color (3 Suits)",
			ID:    37,
			Suits: []Suit{GreenDualSuit, PurpleDualSuit, OrangeDualSuit},
			Clues: []ColorClue{BlueClue, YellowClue, RedClue},
		},
		Variant{
			Name:  "Dual-Color & Rainbow (6 Suits)",
			ID:    5,
			Suits: []Suit{TealDualSuit, LimeDualSuit, OrangeDualSuit, CardinalDualSuit, IndigoDualSuit, RainbowSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue, PurpleClue},
		},
		Variant{
			Name:  "Dual-Color & Rainbow (4 Suits)",
			ID:    38,
			Suits: []Suit{GreenDualSuit, PurpleDualSuit, OrangeDualSuit, RainbowSuit},
			Clues: []ColorClue{BlueClue, YellowClue, RedClue},
		},

		// Multi-Fives
		Variant{
			Name:  "Multi-Fives (6 Suits)",
			ID:    45,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, PurpleSuit, OrangeSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue, PurpleClue, OrangeClue},
		},
		Variant{
			Name:  "Multi-Fives (5 Suits)",
			ID:    46,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, PurpleSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue, PurpleClue},
		},
		Variant{
			Name:  "Multi-Fives (4 Suits)",
			ID:    49,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue},
		},
		Variant{
			Name:  "Multi-Fives (3 Suits)",
			ID:    50,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue},
		},
		Variant{
			Name:  "Multi-Fives & Rainbow (6 Suits)",
			ID:    39,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, PurpleSuit, RainbowSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue, PurpleClue},
		},
		Variant{
			Name:  "Multi-Fives & Rainbow (5 Suits)",
			ID:    14,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, RainbowSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue},
		},
		Variant{
			Name:  "Multi-Fives & Rainbow (4 Suits)",
			ID:    47,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RainbowSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue},
		},
		Variant{
			Name:  "Multi-Fives & Rainbow (3 Suits)",
			ID:    48,
			Suits: []Suit{BlueSuit, GreenSuit, RainbowSuit},
			Clues: []ColorClue{BlueClue, GreenClue},
		},

		// Up or Down
		Variant{
			Name:  "Up or Down (6 Suits)",
			ID:    40,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, PurpleSuit, OrangeSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue, PurpleClue, OrangeClue},
		},
		Variant{
			Name:  "Up or Down (5 Suits)",
			ID:    24,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, PurpleSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue, PurpleClue},
		},
		// "Up or Down (4 Suits)" is too difficult
		Variant{
			Name:  "Up or Down & White (6 Suits)",
			ID:    41,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, PurpleSuit, WhiteSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue, PurpleClue},
		},
		Variant{
			Name:  "Up or Down & White (5 Suits)",
			ID:    42,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, WhiteSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue},
		},
		Variant{
			Name:  "Up or Down & Rainbow (6 Suits)",
			ID:    25,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, PurpleSuit, RainbowSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue, PurpleClue},
		},
		Variant{
			Name:  "Up or Down & Rainbow (5 Suits)",
			ID:    43,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, PurpleSuit, RainbowSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue, PurpleClue},
		},
		Variant{
			Name:  "Up or Down & White & Rainbow (6 Suits)",
			ID:    44,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, WhiteSuit, RainbowSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue},
		},

		// Mixed
		Variant{
			Name:  "African American",
			ID:    20,
			Suits: []Suit{TomatoSuit, MahoganySuit, WhiteSuit, SkySuit, NavySuit, BlackSuit},
			Clues: []ColorClue{BlueClue, RedClue, BlackClue},
		},
		Variant{
			Name:  "Wild & Crazy",
			ID:    7,
			Suits: []Suit{GreenDualSuit, PurpleDualSuit, OrangeDualSuit, WhiteSuit, RainbowSuit, BlackSuit},
			Clues: []ColorClue{BlueClue, YellowClue, RedClue, BlackClue},
		},
	}

	// Validate that all of the ID's are unique
	for _, variant := range variantDefinitions {
		for _, variant2 := range variantDefinitions {
			if variant.Name == variant2.Name {
				continue
			}
			if variant.ID == variant2.ID {
				log.Fatal("Variant \"" + variant.Name + "\" and \"" + variant2.Name + "\" have the same ID (" + strconv.Itoa(variant.ID) + ").")
			}
		}
	}

	// Put all of the variants into a map with their name as an index
	variants = make(map[string]Variant)
	for _, variant := range variantDefinitions {
		variants[variant.Name] = variant
	}

	// Also populate a reverse mapping of ID to variant name
	variantsID = make(map[int]string)
	for _, variant := range variantDefinitions {
		variantsID[variant.ID] = variant.Name
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
