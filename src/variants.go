package main

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
}

// For backward compatibility. We could change other code to get the names and not need this.
// This must generate a slice where the order matches the order in the client.
func getgameVariantNames(list []gameVariant) []string {
	var rv []string
	for _, variant := range list {
		rv = append(rv, variant.Name)
	}
	return rv
}

// CLUES... if you introduce a new color clue, add it here
var (
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
)

// VARIANTS: What suits are used and what clues can be given
var (
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
	return isCluedBy(allVariants[variant].suits[suit].ColorsTouchedBy, allVariants[variant].Clues[clue])
}

// variantGetsuitName gets the name for a suit (given as an int identifier) in a variant (also given as an int identifier)
func variantGetSuitName(variant int, suit int) string {
	return allVariants[variant].suits[suit].Name
}

// variantGetClueName gets the display name of a clue(given as an int identifier)
// that can be given in a variant(given as an int identifier)
func variantGetClueName(variant int, clue int) string {
	return allVariants[variant].Clues[clue].Name

}
