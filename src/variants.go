package main

type ColorClue struct {
	Name string
}

type Suit struct {
	Name            string
	IsOneOfEach     bool
	ColorsTouchedBy []ColorClue
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
// Can use not_touched or all_color_clues if desired.
var (
	BlueSuit     = Suit{Name: "Blue", IsOneOfEach: false, ColorsTouchedBy: []ColorClue{BlueClue}}
	AcidBlueSuit = Suit{Name: "Blue", IsOneOfEach: false, ColorsTouchedBy: not_touched}

	GreenSuit     = Suit{Name: "Green", IsOneOfEach: false, ColorsTouchedBy: []ColorClue{GreenClue}}
	GreenDualSuit = Suit{Name: "Green", IsOneOfEach: false, ColorsTouchedBy: []ColorClue{BlueClue, YellowClue}}
	AcidGreenSuit = Suit{Name: "Green", IsOneOfEach: false, ColorsTouchedBy: not_touched}

	YellowSuit     = Suit{Name: "Yellow", IsOneOfEach: false, ColorsTouchedBy: []ColorClue{YellowClue}}
	AcidYellowSuit = Suit{Name: "Yellow", IsOneOfEach: false, ColorsTouchedBy: not_touched}

	RedSuit     = Suit{Name: "Red", IsOneOfEach: false, ColorsTouchedBy: []ColorClue{RedClue}}
	AcidRedSuit = Suit{Name: "Red", IsOneOfEach: false, ColorsTouchedBy: not_touched}

	PurpleSuit     = Suit{Name: "Purple", IsOneOfEach: false, ColorsTouchedBy: []ColorClue{PurpleClue}}
	PurpleDualSuit = Suit{Name: "Purple", IsOneOfEach: false, ColorsTouchedBy: []ColorClue{RedClue, BlueClue}}
	AcidPurpleSuit = Suit{Name: "Purple", IsOneOfEach: false, ColorsTouchedBy: not_touched}

	OrangeSuit     = Suit{Name: "Orange", IsOneOfEach: false, ColorsTouchedBy: []ColorClue{OrangeClue}}
	OrangeDualSuit = Suit{Name: "Orange", IsOneOfEach: false, ColorsTouchedBy: []ColorClue{YellowClue, RedClue}}
	AcidOrangeSuit = Suit{Name: "Orange", IsOneOfEach: false, ColorsTouchedBy: not_touched}

	BlackSuit = Suit{Name: "Black", IsOneOfEach: false, ColorsTouchedBy: []ColorClue{BlackClue}}

	RainbowSuit  = Suit{Name: "Rainbow", IsOneOfEach: false, ColorsTouchedBy: all_color_clues}
	Rainbow1Suit = Suit{Name: "Rainbow", IsOneOfEach: true, ColorsTouchedBy: all_color_clues}

	WhiteSuit = Suit{Name: "White", IsOneOfEach: false, ColorsTouchedBy: not_touched}

	NavySuit     = Suit{Name: "Navy", IsOneOfEach: false, ColorsTouchedBy: []ColorClue{BlackClue, BlueClue}}
	TanSuit      = Suit{Name: "Tan", IsOneOfEach: false, ColorsTouchedBy: []ColorClue{BlackClue, YellowClue}}
	BurgundySuit = Suit{Name: "Burgundy", IsOneOfEach: false, ColorsTouchedBy: []ColorClue{BlackClue, RedClue}}
	TealSuit     = Suit{Name: "Teal", IsOneOfEach: false, ColorsTouchedBy: []ColorClue{BlueClue, GreenClue}}
	LimeSuit     = Suit{Name: "Lime", IsOneOfEach: false, ColorsTouchedBy: []ColorClue{YellowClue, GreenClue}}
	CardinalSuit = Suit{Name: "Cardinal", IsOneOfEach: false, ColorsTouchedBy: []ColorClue{RedClue, PurpleClue}}
	IndigoSuit   = Suit{Name: "Indigo", IsOneOfEach: false, ColorsTouchedBy: []ColorClue{BlueClue, PurpleClue}}

	SkySuit      = Suit{Name: "Sky", IsOneOfEach: false, ColorsTouchedBy: []ColorClue{BlueClue}}
	ForestSuit   = Suit{Name: "Forest", IsOneOfEach: false, ColorsTouchedBy: []ColorClue{GreenClue}}
	TomatoSuit   = Suit{Name: "Tomato", IsOneOfEach: false, ColorsTouchedBy: []ColorClue{RedClue}}
	BerrySuit    = Suit{Name: "Berry", IsOneOfEach: false, ColorsTouchedBy: []ColorClue{BlueClue}}
	RubySuit     = Suit{Name: "Ruby", IsOneOfEach: false, ColorsTouchedBy: []ColorClue{RedClue}}
	MohaganySuit = Suit{Name: "Mohagany", IsOneOfEach: false, ColorsTouchedBy: []ColorClue{RedClue}}
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
