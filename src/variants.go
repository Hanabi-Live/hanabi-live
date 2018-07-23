package main

type ColorClue struct {
	Name string
}

type Suit struct {
	Name            string
	ColorsTouchedBy []ColorClue
	IsOneOfEach     bool // defaults to false
}

type Variant struct {
	Name  string
	Suits []Suit
	Clues []ColorClue
}

// For backward compatibility. We could change other code to get the names and not need this.
// This must generate a slice where the order matches the order in the client.
func GetVariantNames(list []Variant) []string {
	var rv []string
	for _, variant := range list {
		rv = append(rv, variant.Name)
	}
	return rv
}

// CLUES... if you introduce a new color clue, add it here
var (
	BlueClue   = ColorClue{Name: "Blue"}
	GreenClue  = ColorClue{Name: "Green"}
	YellowClue = ColorClue{Name: "Yellow"}
	RedClue    = ColorClue{Name: "Red"}
	PurpleClue = ColorClue{Name: "Purple"}
	OrangeClue = ColorClue{Name: "Orange"}
	BlackClue  = ColorClue{Name: "Black"}
	// Helpers used for Rainbow and White/Acid
	all_color_clues = []ColorClue{BlueClue, GreenClue, YellowClue, RedClue, PurpleClue, OrangeClue, BlackClue}
	not_touched     = []ColorClue{}
)

// SUITS - add new suits here
// Can use not_touched or all_color_clues if desired. IsOneOfEach defaults to false.
var (
	BlueSuit     = Suit{Name: "Blue", ColorsTouchedBy: []ColorClue{BlueClue}}
	AcidBlueSuit = Suit{Name: "Blue", ColorsTouchedBy: not_touched}

	GreenSuit     = Suit{Name: "Green", ColorsTouchedBy: []ColorClue{GreenClue}}
	GreenDualSuit = Suit{Name: "Green", ColorsTouchedBy: []ColorClue{BlueClue, YellowClue}}
	AcidGreenSuit = Suit{Name: "Green", ColorsTouchedBy: not_touched}

	YellowSuit     = Suit{Name: "Yellow", ColorsTouchedBy: []ColorClue{YellowClue}}
	AcidYellowSuit = Suit{Name: "Yellow", ColorsTouchedBy: not_touched}

	RedSuit     = Suit{Name: "Red", ColorsTouchedBy: []ColorClue{RedClue}}
	AcidRedSuit = Suit{Name: "Red", ColorsTouchedBy: not_touched}

	PurpleSuit     = Suit{Name: "Purple", ColorsTouchedBy: []ColorClue{PurpleClue}}
	PurpleDualSuit = Suit{Name: "Purple", ColorsTouchedBy: []ColorClue{RedClue, BlueClue}}
	AcidPurpleSuit = Suit{Name: "Purple", ColorsTouchedBy: not_touched}

	OrangeSuit     = Suit{Name: "Orange", ColorsTouchedBy: []ColorClue{OrangeClue}}
	OrangeDualSuit = Suit{Name: "Orange", ColorsTouchedBy: []ColorClue{YellowClue, RedClue}}
	AcidOrangeSuit = Suit{Name: "Orange", ColorsTouchedBy: not_touched}

	BlackSuit = Suit{Name: "Black", ColorsTouchedBy: []ColorClue{BlackClue}, IsOneOfEach: true}

	RainbowSuit  = Suit{Name: "Rainbow", ColorsTouchedBy: all_color_clues}
	Rainbow1Suit = Suit{Name: "Rainbow", ColorsTouchedBy: all_color_clues, IsOneOfEach: true}

	WhiteSuit = Suit{Name: "White", ColorsTouchedBy: not_touched}

	NavySuit     = Suit{Name: "Navy", ColorsTouchedBy: []ColorClue{BlackClue, BlueClue}}
	TanSuit      = Suit{Name: "Tan", ColorsTouchedBy: []ColorClue{BlackClue, YellowClue}}
	BurgundySuit = Suit{Name: "Burgundy", ColorsTouchedBy: []ColorClue{BlackClue, RedClue}}
	TealSuit     = Suit{Name: "Teal", ColorsTouchedBy: []ColorClue{BlueClue, GreenClue}}
	LimeSuit     = Suit{Name: "Lime", ColorsTouchedBy: []ColorClue{YellowClue, GreenClue}}
	CardinalSuit = Suit{Name: "Cardinal", ColorsTouchedBy: []ColorClue{RedClue, PurpleClue}}
	IndigoSuit   = Suit{Name: "Indigo", ColorsTouchedBy: []ColorClue{BlueClue, PurpleClue}}

	SkySuit      = Suit{Name: "Sky", ColorsTouchedBy: []ColorClue{BlueClue}}
	ForestSuit   = Suit{Name: "Forest", ColorsTouchedBy: []ColorClue{GreenClue}}
	TomatoSuit   = Suit{Name: "Tomato", ColorsTouchedBy: []ColorClue{RedClue}}
	BerrySuit    = Suit{Name: "Berry", ColorsTouchedBy: []ColorClue{BlueClue}}
	RubySuit     = Suit{Name: "Ruby", ColorsTouchedBy: []ColorClue{RedClue}}
	MohaganySuit = Suit{Name: "Mohagany", ColorsTouchedBy: []ColorClue{RedClue}}
)

// VARIANTS: What suits are used and what clues can be given
var (
	None = Variant{Name: "No Variant",
		Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, PurpleSuit},
		Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue, PurpleClue}}

	Orange = Variant{Name: "Orange",
		Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, PurpleSuit, OrangeSuit},
		Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue, PurpleClue, OrangeClue}}

	Rainbow = Variant{Name: "Rainbow",
		Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, PurpleSuit, RainbowSuit},
		Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue, PurpleClue}}

	DualColor = Variant{Name: "Dual-color",
		Suits: []Suit{GreenDualSuit, PurpleDualSuit, NavySuit, OrangeDualSuit, TanSuit, BurgundySuit},
		Clues: []ColorClue{BlueClue, YellowClue, RedClue, BlackClue}}

	Black = Variant{Name: "Black (1oE)",
		Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, PurpleSuit, BlackSuit},
		Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue, PurpleClue, BlackClue}}

	DualAndRainbow = Variant{Name: "Dual & Rainbow",
		Suits: []Suit{TealSuit, LimeSuit, OrangeDualSuit, CardinalSuit, IndigoSuit},
		Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue, PurpleClue}}

	WhiteAndRainbow = Variant{Name: "White & Rainbow",
		Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, WhiteSuit, RainbowSuit},
		Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue}}

	WildAndCrazy = Variant{Name: "Wild & Crazy",
		Suits: []Suit{GreenDualSuit, PurpleDualSuit, OrangeDualSuit, WhiteSuit, Rainbow1Suit, BlackSuit},
		Clues: []ColorClue{BlueClue, YellowClue, RedClue, BlackClue}}

	Ambiguous = Variant{Name: "Ambiguous",
		Suits: []Suit{SkySuit, NavySuit, LimeSuit, ForestSuit, TomatoSuit, BurgundySuit},
		Clues: []ColorClue{BlueClue, GreenClue, RedClue}}

	BlueRed = Variant{Name: "Blue & Red",
		Suits: []Suit{SkySuit, BerrySuit, NavySuit, TomatoSuit, RubySuit, MohaganySuit},
		Clues: []ColorClue{BlueClue, RedClue}}

	AcidTrip = Variant{Name: "Acid Trip",
		Suits: []Suit{AcidBlueSuit, AcidGreenSuit, AcidYellowSuit, AcidRedSuit, AcidPurpleSuit, AcidOrangeSuit},
		Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue, PurpleClue, OrangeClue}}

	RainbowSingle = Variant{Name: "Rainbow (1oE)",
		Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, PurpleSuit, Rainbow1Suit},
		Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue, PurpleClue}}

	BlackRainbowSingle = Variant{Name: "Black & Rainbow (1oE)",
		Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, BlackSuit, Rainbow1Suit},
		Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue, BlackClue}}

	// Used for backward compatibility. The order of variants MUST match the client order, therefore
	// this slice must match the order of the client.
	all_variants = []Variant{None, Orange, Black, Rainbow, DualColor, DualAndRainbow, WhiteAndRainbow, WildAndCrazy, Ambiguous, BlueRed, AcidTrip, RainbowSingle, BlackRainbowSingle}
	variants     = GetVariantNames(all_variants)
)

// variantIsSuit1oE takes in a variant int identifier and a suit and returns if the suit
// should have only 1 of each suit.
func variantIsSuit1oE(variant int, suit int) bool {
	return all_variants[variant].Suits[suit].IsOneOfEach
}

// isCluedBy takes a slice of ColorClues and a ColorClue and returns true if
// the ColorClue is in the list or false otherwise. Why go doesn't have such
// a feature built is beyond my scope of knowledge of the language...
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

// variantIsCardTouched takes the variant int identifier, the clue int identifier, and the suit int identifier
// and looks up if the clue touches the suit in this particular variant. For example, a Yellow clue will touch
// a green card in dual suit, but not in normal.
func variantIsCardTouched(variant int, clue int, suit int) bool {
	return isCluedBy(all_variants[variant].Suits[suit].ColorsTouchedBy, all_variants[variant].Clues[clue])
}

// variantGetSuitName gets the name for a suit (given as an int identifier) in a variant (also given as an int identifier)
func variantGetSuitName(variant int, suit int) string {
	return all_variants[variant].Suits[suit].Name
}

// variantGetClueName gets the display name of a clue(given as an int identifier)
// that can be given in a variant(given as an int identifier)
func variantGetClueName(variant int, clue int) string {
	return all_variants[variant].Clues[clue].Name

}
