package main

/*
	Data types
*/

type Variant struct {
	Name  string
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

/*
	Clues
*/

var (
	BlueClue   = ColorClue{Name: "Blue"}
	GreenClue  = ColorClue{Name: "Green"}
	YellowClue = ColorClue{Name: "Yellow"}
	RedClue    = ColorClue{Name: "Red"}
	PurpleClue = ColorClue{Name: "Purple"}
	OrangeClue = ColorClue{Name: "Orange"}
	BlackClue  = ColorClue{Name: "Black"}

	// Helpers used for "Rainbow", "Colorless & Rainbow", and "Color Blind"
	allColorClues = []ColorClue{BlueClue, GreenClue, YellowClue, RedClue, PurpleClue, OrangeClue, BlackClue}
	noColorClues  = []ColorClue{}
)

/*
	Suits
*/

// Can use "allColorClues" or "noColorClues" as the second argument for brevity
var (
	// For "No Variant"
	BlueSuit   = NewSuit("Blue", []ColorClue{BlueClue})
	GreenSuit  = NewSuit("Green", []ColorClue{GreenClue})
	YellowSuit = NewSuit("Yellow", []ColorClue{YellowClue})
	RedSuit    = NewSuit("Red", []ColorClue{RedClue})
	PurpleSuit = NewSuit("Purple", []ColorClue{PurpleClue})

	// For "Orange Suit"
	OrangeSuit = NewSuit("Orange", []ColorClue{OrangeClue})

	// For "Black Suit (one of each)"
	BlackSuit = NewSuit1oE("Black", []ColorClue{BlackClue})

	// For "Rainbow Suit (all colors)"
	RainbowSuit = NewSuit("Rainbow", allColorClues)

	// For "Dual-color Suits"
	GreenDualSuit    = NewSuit("Green", []ColorClue{BlueClue, YellowClue})
	PurpleDualSuit   = NewSuit("Purple", []ColorClue{RedClue, BlueClue})
	NavyDualSuit     = NewSuit("Navy", []ColorClue{BlackClue, BlueClue})
	OrangeDualSuit   = NewSuit("Orange", []ColorClue{YellowClue, RedClue})
	TanDualSuit      = NewSuit("Tan", []ColorClue{BlackClue, YellowClue})
	BurgundyDualSuit = NewSuit("Burgundy", []ColorClue{BlackClue, RedClue})

	// For "Dual-color & Rainbow Suits"
	TealDualSuit = NewSuit("Teal", []ColorClue{BlueClue, GreenClue})
	LimeDualSuit = NewSuit("Lime", []ColorClue{YellowClue, GreenClue})
	// OrangeDualSuit is reused
	CardinalDualSuit = NewSuit("Cardinal", []ColorClue{RedClue, PurpleClue})
	IndigoDualSuit   = NewSuit("Indigo", []ColorClue{BlueClue, PurpleClue})

	// For "Colorless & Rainbow Suits"
	WhiteSuit = NewSuit("White", noColorClues)

	// For "Ambiguous Suits"
	SkySuit      = NewSuit("Sky", []ColorClue{BlueClue})
	NavySuit     = NewSuit("Navy", []ColorClue{BlueClue})
	LimeSuit     = NewSuit("Lime", []ColorClue{GreenClue})
	ForestSuit   = NewSuit("Forest", []ColorClue{GreenClue})
	TomatoSuit   = NewSuit("Tomato", []ColorClue{RedClue})
	MohaganySuit = NewSuit("Mohagany", []ColorClue{RedClue})

	// For "Blue & Red Suits"
	BerrySuit = NewSuit("Berry", []ColorClue{BlueClue})
	RubySuit  = NewSuit("Ruby", []ColorClue{RedClue})

	// For "Color Blind"
	BlindBlueSuit   = NewSuit("Blue", noColorClues)
	BlindGreenSuit  = NewSuit("Green", noColorClues)
	BlindYellowSuit = NewSuit("Yellow", noColorClues)
	BlindRedSuit    = NewSuit("Red", noColorClues)
	BlindPurpleSuit = NewSuit("Purple", noColorClues)
	BlindOrangeSuit = NewSuit("Orange", noColorClues)

	// For "Rainbow & Black Suits (1 of each)"
	Rainbow1oESuit = NewSuit1oE("Rainbow", allColorClues)
)

/*
	Variants
*/

// The order of variants must match the client order
// (in the "constants.js" file)
var (
	variants = []Variant{
		Variant{
			Name:  "No Variant",
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, PurpleSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue, PurpleClue},
		},
		Variant{
			Name:  "Orange",
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, PurpleSuit, OrangeSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue, PurpleClue, OrangeClue},
		},
		Variant{
			Name:  "Black (1oE)",
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, PurpleSuit, BlackSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue, PurpleClue, BlackClue},
		},
		Variant{
			Name:  "Rainbow",
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, PurpleSuit, RainbowSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue, PurpleClue},
		},
		Variant{
			Name:  "Dual-color",
			Suits: []Suit{GreenDualSuit, PurpleDualSuit, NavyDualSuit, OrangeDualSuit, TanDualSuit, BurgundyDualSuit},
			Clues: []ColorClue{BlueClue, YellowClue, RedClue, BlackClue},
		},
		Variant{
			Name:  "Dual & Rainbow",
			Suits: []Suit{TealDualSuit, LimeDualSuit, OrangeDualSuit, CardinalDualSuit, IndigoDualSuit, RainbowSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue, PurpleClue},
		},
		Variant{
			Name:  "White & Rainbow",
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, WhiteSuit, RainbowSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue},
		},
		Variant{
			Name:  "Wild & Crazy",
			Suits: []Suit{GreenDualSuit, PurpleDualSuit, OrangeDualSuit, WhiteSuit, RainbowSuit, BlackSuit},
			Clues: []ColorClue{BlueClue, YellowClue, RedClue, BlackClue},
		},
		Variant{
			Name:  "Ambiguous",
			Suits: []Suit{SkySuit, NavySuit, LimeSuit, ForestSuit, TomatoSuit, MohaganySuit},
			Clues: []ColorClue{BlueClue, GreenClue, RedClue},
		},
		Variant{
			Name:  "Blue & Red",
			Suits: []Suit{SkySuit, BerrySuit, NavySuit, TomatoSuit, RubySuit, MohaganySuit},
			Clues: []ColorClue{BlueClue, RedClue},
		},
		Variant{
			Name:  "Color Blind",
			Suits: []Suit{BlindBlueSuit, BlindGreenSuit, BlindYellowSuit, BlindRedSuit, BlindPurpleSuit, BlindOrangeSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue, PurpleClue, OrangeClue},
		},
		Variant{
			Name:  "Rainbow (1oE)",
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, PurpleSuit, Rainbow1oESuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue, PurpleClue},
		},
		Variant{
			Name:  "Black & Rainbow (1oE)",
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, BlackSuit, Rainbow1oESuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue, BlackClue},
		},
		Variant{
			Name:  "White",
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, PurpleSuit, WhiteSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue, PurpleClue},
		},
	}
)

// variantIsCardTouched returns true if a color clue will touch a particular suit
// For example, a yellow clue will not touch a green card in "No Variant", but it will in "Dual-color Suits"
func variantIsCardTouched(variant int, clue int, suit int) bool {
	return isCluedBy(variants[variant].Suits[suit].ColorsTouchedBy, variants[variant].Clues[clue])
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
