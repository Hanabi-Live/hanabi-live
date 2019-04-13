package main

var (
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
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, PurpleSuit, TealSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue, PurpleClue, TealClue},
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
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, PurpleSuit, DarkRainbowSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue, PurpleClue},
		},
		Variant{
			Name:  "Dark Rainbow (5 Suits)",
			ID:    23,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, DarkRainbowSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue},
		},
		// "Dark Rainbow (4 Suits)" would be too difficult
		Variant{
			Name:  "Black & Dark Rainbow (6 Suits)",
			ID:    12,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, BlackSuit, DarkRainbowSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue, BlackClue},
		},
		// "Black & Dark Rainbow (5 Suits)" would be too difficult

		// Gray
		Variant{
			Name:  "Gray (5 Suits)",
			ID:    58,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, GraySuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue},
		},
		Variant{
			Name:  "Gray (6 Suits)",
			ID:    59,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, PurpleSuit, GraySuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue, PurpleClue},
		},
		Variant{
			Name:  "Black and Gray (6 Suits)",
			ID:    60,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, GraySuit, BlackSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue, BlackClue},
		},
		Variant{
			Name:  "Gray and Rainbow (6 Suits)",
			ID:    61,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, GraySuit, RainbowSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue},
		},
		Variant{
			Name:  "Gray and Dark Rainbow (6 Suits)",
			ID:    62,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, GraySuit, DarkRainbowSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue},
		},
		// "Triple black (6 suits)" would be too difficult

		// Color Blind
		Variant{
			Name:  "Color Blind (6 Suits)",
			ID:    10,
			Suits: []Suit{BlindBlueSuit, BlindGreenSuit, BlindYellowSuit, BlindRedSuit, BlindPurpleSuit, BlindTealSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue, PurpleClue, TealClue},
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
			Name:  "Ambiguous (4 Suits)",
			ID:    30,
			Suits: []Suit{SkySuit, NavySuit, TomatoSuit, MahoganySuit},
			Clues: []ColorClue{BlueClue, RedClue},
		},
		Variant{
			Name:  "Ambiguous & White (5 Suits)",
			ID:    31,
			Suits: []Suit{SkySuit, NavySuit, TomatoSuit, MahoganySuit, WhiteSuit},
			Clues: []ColorClue{BlueClue, RedClue},
		},
		Variant{
			Name:  "Ambiguous & Rainbow (5 Suits)",
			ID:    32,
			Suits: []Suit{SkySuit, NavySuit, TomatoSuit, MahoganySuit, RainbowSuit},
			Clues: []ColorClue{BlueClue, RedClue},
		},
		Variant{
			Name:  "Very Ambiguous (6 Suits)",
			ID:    9,
			Suits: []Suit{SkySuit, BerrySuit, NavySuit, TomatoSuit, RubySuit, MahoganySuit},
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
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, PurpleSuit, TealSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue, PurpleClue, TealClue},
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

		// Clue Starved
		Variant{
			Name:  "Clue Starved (6 Suits)",
			ID:    51,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, PurpleSuit, TealSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue, PurpleClue, TealClue},
		},
		Variant{
			Name:  "Clue Starved (5 Suits)",
			ID:    52,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, PurpleSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue, PurpleClue},
		},
		Variant{
			Name:  "Clue Starved (4 Suits)",
			ID:    53,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue},
		},

		// Up or Down
		Variant{
			Name:  "Up or Down (6 Suits)",
			ID:    40,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, PurpleSuit, TealSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue, PurpleClue, TealClue},
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
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, RainbowSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue},
		},
		Variant{
			Name:  "Up or Down & White & Rainbow (6 Suits)",
			ID:    44,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, WhiteSuit, RainbowSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue},
		},

		// Duck
		Variant{
			Name:  "Duck (6 Suits)",
			ID:    54,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, PurpleSuit, TealSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue, PurpleClue, TealClue},
		},
		Variant{
			Name:  "Duck (5 Suits)",
			ID:    55,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, PurpleSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue, PurpleClue},
		},
		Variant{
			Name:  "Duck (4 Suits)",
			ID:    56,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue},
		},
		Variant{
			Name:  "Duck (3 Suits)",
			ID:    57,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue},
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
)
