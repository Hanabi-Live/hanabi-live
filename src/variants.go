package main

<<<<<<< HEAD
type colorClue struct {
	Name string
}

type suit struct {
	Name            string
	ColorsTouchedBy []colorClue
	IsOneOfEach     bool // defaults to false
}

type gameVariant struct {
	Name  string
	suits []suit
	Clues []colorClue
=======
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
>>>>>>> 58e44c30aef0819886e5f1af62e3dbc54757164e
}

// For backward compatibility. We could change other code to get the names and not need this.
// This must generate a slice where the order matches the order in the client.
<<<<<<< HEAD
func getgameVariantNames(list []gameVariant) []string {
=======
func GetVariantNames(list []Variant) []string {
>>>>>>> 58e44c30aef0819886e5f1af62e3dbc54757164e
	var rv []string
	for _, variant := range list {
		rv = append(rv, variant.Name)
	}
	return rv
}

// CLUES... if you introduce a new color clue, add it here
var (
<<<<<<< HEAD
	BlueClue   = colorClue{Name: "Blue"}
	GreenClue  = colorClue{Name: "Green"}
	YellowClue = colorClue{Name: "Yellow"}
	RedClue    = colorClue{Name: "Red"}
	PurpleClue = colorClue{Name: "Purple"}
	OrangeClue = colorClue{Name: "Orange"}
	BlackClue  = colorClue{Name: "Black"}
	// Helpers used for Rainbow and White/Acid
	allColorClues = []colorClue{BlueClue, GreenClue, YellowClue, RedClue, PurpleClue, OrangeClue, BlackClue}
	notTouched    = []colorClue{}
)

// SUITS - add new suits here
// Can use notTouched or allColorClues if desired. IsOneOfEach defaults to false.
var (
	Bluesuit     = suit{Name: "Blue", ColorsTouchedBy: []colorClue{BlueClue}}
	AcidBluesuit = suit{Name: "Blue", ColorsTouchedBy: notTouched}

	Greensuit     = suit{Name: "Green", ColorsTouchedBy: []colorClue{GreenClue}}
	GreenDualsuit = suit{Name: "Green", ColorsTouchedBy: []colorClue{BlueClue, YellowClue}}
	AcidGreensuit = suit{Name: "Green", ColorsTouchedBy: notTouched}

	Yellowsuit     = suit{Name: "Yellow", ColorsTouchedBy: []colorClue{YellowClue}}
	AcidYellowsuit = suit{Name: "Yellow", ColorsTouchedBy: notTouched}

	Redsuit     = suit{Name: "Red", ColorsTouchedBy: []colorClue{RedClue}}
	AcidRedsuit = suit{Name: "Red", ColorsTouchedBy: notTouched}

	Purplesuit     = suit{Name: "Purple", ColorsTouchedBy: []colorClue{PurpleClue}}
	PurpleDualsuit = suit{Name: "Purple", ColorsTouchedBy: []colorClue{RedClue, BlueClue}}
	AcidPurplesuit = suit{Name: "Purple", ColorsTouchedBy: notTouched}

	Orangesuit     = suit{Name: "Orange", ColorsTouchedBy: []colorClue{OrangeClue}}
	OrangeDualsuit = suit{Name: "Orange", ColorsTouchedBy: []colorClue{YellowClue, RedClue}}
	AcidOrangesuit = suit{Name: "Orange", ColorsTouchedBy: notTouched}

	Blacksuit = suit{Name: "Black", ColorsTouchedBy: []colorClue{BlackClue}, IsOneOfEach: true}

	Rainbowsuit  = suit{Name: "Rainbow", ColorsTouchedBy: allColorClues}
	Rainbow1suit = suit{Name: "Rainbow", ColorsTouchedBy: allColorClues, IsOneOfEach: true}

	Whitesuit = suit{Name: "White", ColorsTouchedBy: notTouched}

	Navysuit     = suit{Name: "Navy", ColorsTouchedBy: []colorClue{BlackClue, BlueClue}}
	Tansuit      = suit{Name: "Tan", ColorsTouchedBy: []colorClue{BlackClue, YellowClue}}
	Burgundysuit = suit{Name: "Burgundy", ColorsTouchedBy: []colorClue{BlackClue, RedClue}}
	Tealsuit     = suit{Name: "Teal", ColorsTouchedBy: []colorClue{BlueClue, GreenClue}}
	Limesuit     = suit{Name: "Lime", ColorsTouchedBy: []colorClue{YellowClue, GreenClue}}
	Cardinalsuit = suit{Name: "Cardinal", ColorsTouchedBy: []colorClue{RedClue, PurpleClue}}
	Indigosuit   = suit{Name: "Indigo", ColorsTouchedBy: []colorClue{BlueClue, PurpleClue}}

	Skysuit      = suit{Name: "Sky", ColorsTouchedBy: []colorClue{BlueClue}}
	Forestsuit   = suit{Name: "Forest", ColorsTouchedBy: []colorClue{GreenClue}}
	Tomatosuit   = suit{Name: "Tomato", ColorsTouchedBy: []colorClue{RedClue}}
	Berrysuit    = suit{Name: "Berry", ColorsTouchedBy: []colorClue{BlueClue}}
	Rubysuit     = suit{Name: "Ruby", ColorsTouchedBy: []colorClue{RedClue}}
	Mohaganysuit = suit{Name: "Mohagany", ColorsTouchedBy: []colorClue{RedClue}}
=======
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
>>>>>>> 58e44c30aef0819886e5f1af62e3dbc54757164e
)

// VARIANTS: What suits are used and what clues can be given
var (
<<<<<<< HEAD
	None = gameVariant{Name: "No gameVariant",
		suits: []suit{Bluesuit, Greensuit, Yellowsuit, Redsuit, Purplesuit},
		Clues: []colorClue{BlueClue, GreenClue, YellowClue, RedClue, PurpleClue}}

	Orange = gameVariant{Name: "Orange",
		suits: []suit{Bluesuit, Greensuit, Yellowsuit, Redsuit, Purplesuit, Orangesuit},
		Clues: []colorClue{BlueClue, GreenClue, YellowClue, RedClue, PurpleClue, OrangeClue}}

	Rainbow = gameVariant{Name: "Rainbow",
		suits: []suit{Bluesuit, Greensuit, Yellowsuit, Redsuit, Purplesuit, Rainbowsuit},
		Clues: []colorClue{BlueClue, GreenClue, YellowClue, RedClue, PurpleClue}}

	DualColor = gameVariant{Name: "Dual-color",
		suits: []suit{GreenDualsuit, PurpleDualsuit, Navysuit, OrangeDualsuit, Tansuit, Burgundysuit},
		Clues: []colorClue{BlueClue, YellowClue, RedClue, BlackClue}}

	Black = gameVariant{Name: "Black (1oE)",
		suits: []suit{Bluesuit, Greensuit, Yellowsuit, Redsuit, Purplesuit, Blacksuit},
		Clues: []colorClue{BlueClue, GreenClue, YellowClue, RedClue, PurpleClue, BlackClue}}

	DualAndRainbow = gameVariant{Name: "Dual & Rainbow",
		suits: []suit{Tealsuit, Limesuit, OrangeDualsuit, Cardinalsuit, Indigosuit},
		Clues: []colorClue{BlueClue, GreenClue, YellowClue, RedClue, PurpleClue}}

	WhiteAndRainbow = gameVariant{Name: "White & Rainbow",
		suits: []suit{Bluesuit, Greensuit, Yellowsuit, Redsuit, Whitesuit, Rainbowsuit},
		Clues: []colorClue{BlueClue, GreenClue, YellowClue, RedClue}}

	WildAndCrazy = gameVariant{Name: "Wild & Crazy",
		suits: []suit{GreenDualsuit, PurpleDualsuit, OrangeDualsuit, Whitesuit, Rainbow1suit, Blacksuit},
		Clues: []colorClue{BlueClue, YellowClue, RedClue, BlackClue}}

	Ambiguous = gameVariant{Name: "Ambiguous",
		suits: []suit{Skysuit, Navysuit, Limesuit, Forestsuit, Tomatosuit, Burgundysuit},
		Clues: []colorClue{BlueClue, GreenClue, RedClue}}

	BlueRed = gameVariant{Name: "Blue & Red",
		suits: []suit{Skysuit, Berrysuit, Navysuit, Tomatosuit, Rubysuit, Mohaganysuit},
		Clues: []colorClue{BlueClue, RedClue}}

	AcidTrip = gameVariant{Name: "Acid Trip",
		suits: []suit{AcidBluesuit, AcidGreensuit, AcidYellowsuit, AcidRedsuit, AcidPurplesuit, AcidOrangesuit},
		Clues: []colorClue{BlueClue, GreenClue, YellowClue, RedClue, PurpleClue, OrangeClue}}

	RainbowSingle = gameVariant{Name: "Rainbow (1oE)",
		suits: []suit{Bluesuit, Greensuit, Yellowsuit, Redsuit, Purplesuit, Rainbow1suit},
		Clues: []colorClue{BlueClue, GreenClue, YellowClue, RedClue, PurpleClue}}

	BlackRainbowSingle = gameVariant{Name: "Black & Rainbow (1oE)",
		suits: []suit{Bluesuit, Greensuit, Yellowsuit, Redsuit, Blacksuit, Rainbow1suit},
		Clues: []colorClue{BlueClue, GreenClue, YellowClue, RedClue, BlackClue}}

	// Used for backward compatibility. The order of variants MUST match the client order, therefore
	// this slice must match the order of the client.
	allVariants = []gameVariant{None, Orange, Black, Rainbow, DualColor, DualAndRainbow, WhiteAndRainbow, WildAndCrazy, Ambiguous, BlueRed, AcidTrip, RainbowSingle, BlackRainbowSingle}
	variants    = getgameVariantNames(allVariants)
)

// variantIssuit1oE takes in a variant int identifier and a suit and returns if the suit
// should have only 1 of each suit.
func variantIsSuit1oE(variant int, suit int) bool {
	return allVariants[variant].suits[suit].IsOneOfEach
}

// isCluedBy takes a slice of colorClues and a colorClue and returns true if
// the colorClue is in the list or false otherwise. Why go doesn't have such
// a feature built is beyond my scope of knowledge of the language...
func isCluedBy(list []colorClue, item colorClue) bool {
=======
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
>>>>>>> 58e44c30aef0819886e5f1af62e3dbc54757164e
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
<<<<<<< HEAD
	return isCluedBy(allVariants[variant].suits[suit].ColorsTouchedBy, allVariants[variant].Clues[clue])
}

// variantGetsuitName gets the name for a suit (given as an int identifier) in a variant (also given as an int identifier)
func variantGetSuitName(variant int, suit int) string {
	return allVariants[variant].suits[suit].Name
=======
	return isCluedBy(all_variants[variant].Suits[suit].ColorsTouchedBy, all_variants[variant].Clues[clue])
}

// variantGetSuitName gets the name for a suit (given as an int identifier) in a variant (also given as an int identifier)
func variantGetSuitName(variant int, suit int) string {
	return all_variants[variant].Suits[suit].Name
>>>>>>> 58e44c30aef0819886e5f1af62e3dbc54757164e
}

// variantGetClueName gets the display name of a clue(given as an int identifier)
// that can be given in a variant(given as an int identifier)
func variantGetClueName(variant int, clue int) string {
<<<<<<< HEAD
	return allVariants[variant].Clues[clue].Name
=======
	return all_variants[variant].Clues[clue].Name
>>>>>>> 58e44c30aef0819886e5f1af62e3dbc54757164e

}
