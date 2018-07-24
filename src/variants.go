package main

// ColorClue is just a typed string
type ColorClue struct {
	Name string
}

// Suit defines the attributes of a suit
type Suit struct {
	Name            string
	ColorsTouchedBy []ColorClue
	IsOneOfEach     bool // defaults to false
}

// GameVariant defines a variant... yeah, useless comment, I know.
type GameVariant struct {
	Name  string
	Suits []Suit
	Clues []ColorClue
}

// For backward compatibility. We could change other code to get the names and not need this.
// This must generate a slice where the order matches the order in the client.
func getGameVariantNames(list []GameVariant) []string {
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
	allColorClues = []ColorClue{BlueClue, GreenClue, YellowClue, RedClue, PurpleClue, OrangeClue, BlackClue}
	notTouched    = []ColorClue{}
)

// SUITS - add new suits here
// Can use notTouched or allColorClues if desired. IsOneOfEach defaults to false.
var (
	BlueSuit     = Suit{Name: "Blue", ColorsTouchedBy: []ColorClue{BlueClue}}
	AcidBlueSuit = Suit{Name: "Blue", ColorsTouchedBy: notTouched}

	GreenSuit     = Suit{Name: "Green", ColorsTouchedBy: []ColorClue{GreenClue}}
	GreenDualSuit = Suit{Name: "Green", ColorsTouchedBy: []ColorClue{BlueClue, YellowClue}}
	AcidGreenSuit = Suit{Name: "Green", ColorsTouchedBy: notTouched}

	YellowSuit     = Suit{Name: "Yellow", ColorsTouchedBy: []ColorClue{YellowClue}}
	AcidYellowSuit = Suit{Name: "Yellow", ColorsTouchedBy: notTouched}

	RedSuit     = Suit{Name: "Red", ColorsTouchedBy: []ColorClue{RedClue}}
	AcidRedSuit = Suit{Name: "Red", ColorsTouchedBy: notTouched}

	PurpleSuit     = Suit{Name: "Purple", ColorsTouchedBy: []ColorClue{PurpleClue}}
	PurpleDualSuit = Suit{Name: "Purple", ColorsTouchedBy: []ColorClue{RedClue, BlueClue}}
	AcidPurpleSuit = Suit{Name: "Purple", ColorsTouchedBy: notTouched}

	OrangeSuit     = Suit{Name: "Orange", ColorsTouchedBy: []ColorClue{OrangeClue}}
	OrangeDualSuit = Suit{Name: "Orange", ColorsTouchedBy: []ColorClue{YellowClue, RedClue}}
	AcidOrangeSuit = Suit{Name: "Orange", ColorsTouchedBy: notTouched}

	BlackSuit = Suit{Name: "Black", ColorsTouchedBy: []ColorClue{BlackClue}, IsOneOfEach: true}

	RainbowSuit  = Suit{Name: "Rainbow", ColorsTouchedBy: allColorClues}
	Rainbow1Suit = Suit{Name: "Rainbow", ColorsTouchedBy: allColorClues, IsOneOfEach: true}

	WhiteSuit = Suit{Name: "White", ColorsTouchedBy: notTouched}

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
	None = GameVariant{Name: "No GameVariant",
		Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, PurpleSuit},
		Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue, PurpleClue}}

	Orange = GameVariant{Name: "Orange",
		Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, PurpleSuit, OrangeSuit},
		Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue, PurpleClue, OrangeClue}}

	Rainbow = GameVariant{Name: "Rainbow",
		Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, PurpleSuit, RainbowSuit},
		Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue, PurpleClue}}

	DualColor = GameVariant{Name: "Dual-color",
		Suits: []Suit{GreenDualSuit, PurpleDualSuit, NavySuit, OrangeDualSuit, TanSuit, BurgundySuit},
		Clues: []ColorClue{BlueClue, YellowClue, RedClue, BlackClue}}

	Black = GameVariant{Name: "Black (1oE)",
		Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, PurpleSuit, BlackSuit},
		Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue, PurpleClue, BlackClue}}

	DualAndRainbow = GameVariant{Name: "Dual & Rainbow",
		Suits: []Suit{TealSuit, LimeSuit, OrangeDualSuit, CardinalSuit, IndigoSuit},
		Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue, PurpleClue}}

	WhiteAndRainbow = GameVariant{Name: "White & Rainbow",
		Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, WhiteSuit, RainbowSuit},
		Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue}}

	WildAndCrazy = GameVariant{Name: "Wild & Crazy",
		Suits: []Suit{GreenDualSuit, PurpleDualSuit, OrangeDualSuit, WhiteSuit, Rainbow1Suit, BlackSuit},
		Clues: []ColorClue{BlueClue, YellowClue, RedClue, BlackClue}}

	Ambiguous = GameVariant{Name: "Ambiguous",
		Suits: []Suit{SkySuit, NavySuit, LimeSuit, ForestSuit, TomatoSuit, BurgundySuit},
		Clues: []ColorClue{BlueClue, GreenClue, RedClue}}

	BlueRed = GameVariant{Name: "Blue & Red",
		Suits: []Suit{SkySuit, BerrySuit, NavySuit, TomatoSuit, RubySuit, MohaganySuit},
		Clues: []ColorClue{BlueClue, RedClue}}

	AcidTrip = GameVariant{Name: "Acid Trip",
		Suits: []Suit{AcidBlueSuit, AcidGreenSuit, AcidYellowSuit, AcidRedSuit, AcidPurpleSuit, AcidOrangeSuit},
		Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue, PurpleClue, OrangeClue}}

	RainbowSingle = GameVariant{Name: "Rainbow (1oE)",
		Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, PurpleSuit, Rainbow1Suit},
		Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue, PurpleClue}}

	BlackRainbowSingle = GameVariant{Name: "Black & Rainbow (1oE)",
		Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, BlackSuit, Rainbow1Suit},
		Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue, BlackClue}}

	// Used for backward compatibility. The order of variants MUST match the client order, therefore
	// this slice must match the order of the client.
	allVariants = []GameVariant{None, Orange, Black, Rainbow, DualColor, DualAndRainbow, WhiteAndRainbow, WildAndCrazy, Ambiguous, BlueRed, AcidTrip, RainbowSingle, BlackRainbowSingle}
	variants    = getGameVariantNames(allVariants)
)

// variantIssuit1oE takes in a variant int identifier and a suit and returns if the suit
// should have only 1 of each suit.
func variantIsSuit1oE(variant int, suit int) bool {
	return allVariants[variant].Suits[suit].IsOneOfEach
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
	return isCluedBy(allVariants[variant].Suits[suit].ColorsTouchedBy, allVariants[variant].Clues[clue])
}

// variantGetsuitName gets the name for a suit (given as an int identifier) in a variant (also given as an int identifier)
func variantGetSuitName(variant int, suit int) string {
	return allVariants[variant].Suits[suit].Name
}

// variantGetClueName gets the display name of a clue(given as an int identifier)
// that can be given in a variant(given as an int identifier)
func variantGetClueName(variant int, clue int) string {
	return allVariants[variant].Clues[clue].Name

}
