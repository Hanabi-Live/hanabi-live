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
	// Each variant must have a unique numerical ID for seed generation purposes (and for the database)
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
	TealClue   = ColorClue{Name: "Teal"}
	BlackClue  = ColorClue{Name: "Black"}

	// Helpers used for some variants
	allColorClues = []ColorClue{BlueClue, GreenClue, YellowClue, RedClue, PurpleClue, TealClue, BlackClue}
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
	TealSuit        = NewSuit("Teal", []ColorClue{TealClue})
	BlackSuit       = NewSuit1oE("Black", []ColorClue{BlackClue})
	RainbowSuit     = NewSuit("Rainbow", allColorClues)
	WhiteSuit       = NewSuit("White", noColorClues)
	DarkRainbowSuit = NewSuit1oE("Rainbow", allColorClues)
	GraySuit        = NewSuit1oE("Gray", noColorClues)

	// For "Color Blind"
	BlindBlueSuit   = NewSuit("Blue", noColorClues)
	BlindGreenSuit  = NewSuit("Green", noColorClues)
	BlindYellowSuit = NewSuit("Yellow", noColorClues)
	BlindRedSuit    = NewSuit("Red", noColorClues)
	BlindPurpleSuit = NewSuit("Purple", noColorClues)
	BlindTealSuit   = NewSuit("Teal", noColorClues)

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
	IndigoDualSuit   = NewSuit("Indigo", []ColorClue{PurpleClue, BlueClue})
)

// Variants
var (
	variants   map[string]Variant
	variantsID map[int]string
)

func variantsInit() {
	// Validate that all of the ID's are unique
	for _, variant := range variantDefinitions {
		for _, variant2 := range variantDefinitions {
			if variant.Name == variant2.Name {
				continue
			}
			if variant.ID == variant2.ID {
				log.Fatal(
					"Variant \"" + variant.Name + "\" and \"" + variant2.Name + "\" " +
						"have the same ID (" + strconv.Itoa(variant.ID) + ").",
				)
			}
		}
	}

	// Put all of the variants into a map with their name as an index
	variants = make(map[string]Variant)
	for _, variant := range variantDefinitions {
		variants[variant.Name] = variant
	}

	// Also populate a reverse mapping of ID to name
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
