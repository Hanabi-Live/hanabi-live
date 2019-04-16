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

		// Brown
		Variant{
			Name:  "Brown (6 Suits)",
			ID:    69,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, PurpleSuit, BrownSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue, PurpleClue, BrownClue},
		},
		Variant{
			Name:  "Brown (5 Suits)",
			ID:    70,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, BrownSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue, BrownClue},
		},
		Variant{
			Name:  "Brown (4 Suits)",
			ID:    71,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, BrownSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, BrownClue},
		},
		Variant{
			Name:  "Brown (3 Suits)",
			ID:    72,
			Suits: []Suit{BlueSuit, GreenSuit, BrownSuit},
			Clues: []ColorClue{BlueClue, GreenClue, BrownClue},
		},

		// Black & Rainbow
		Variant{
			Name:  "Black & Rainbow (6 Suits)",
			ID:    65,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, BlackSuit, RainbowSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue, BlackClue},
		},
		Variant{
			Name:  "Black & Rainbow (5 Suits)",
			ID:    66,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, BlackSuit, RainbowSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue},
		},

		// Black & White
		Variant{
			Name:  "Black & White (6 Suits)",
			ID:    63,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, BlackSuit, WhiteSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue, BlackClue},
		},
		Variant{
			Name:  "Black & White (5 Suits)",
			ID:    64,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, BlackSuit, WhiteSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, BlackClue},
		},

		// Black & Brown
		Variant{
			Name:  "Black & Brown (6 Suits)",
			ID:    73,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, BlackSuit, BrownSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue, BlackClue, BrownClue},
		},
		Variant{
			Name:  "Black & Brown (5 Suits)",
			ID:    74,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, BlackSuit, BrownSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, BlackClue, BrownClue},
		},

		// Rainbow & White
		Variant{
			Name:  "Rainbow & White (6 Suits)",
			ID:    6,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, RainbowSuit, WhiteSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue},
		},
		Variant{
			Name:  "Rainbow & White (5 Suits)",
			ID:    28,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RainbowSuit, WhiteSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue},
		},
		Variant{
			Name:  "Rainbow & White (4 Suits)",
			ID:    29,
			Suits: []Suit{BlueSuit, GreenSuit, RainbowSuit, WhiteSuit},
			Clues: []ColorClue{BlueClue, GreenClue},
		},

		// Rainbow & Brown
		Variant{
			Name:  "Rainbow & Brown (6 Suits)",
			ID:    75,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, RainbowSuit, BrownSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue, BrownClue},
		},
		Variant{
			Name:  "Rainbow & Brown (5 Suits)",
			ID:    76,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RainbowSuit, BrownSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, BrownClue},
		},
		Variant{
			Name:  "Rainbow & Brown (4 Suits)",
			ID:    77,
			Suits: []Suit{BlueSuit, GreenSuit, RainbowSuit, BrownSuit},
			Clues: []ColorClue{BlueClue, GreenClue, BrownClue},
		},
		Variant{
			Name:  "Rainbow & Brown (3 Suits)",
			ID:    78,
			Suits: []Suit{BlueSuit, RainbowSuit, BrownSuit},
			Clues: []ColorClue{BlueClue, BrownClue},
		},

		// White & Brown
		Variant{
			Name:  "White & Brown (6 Suits)",
			ID:    79,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, WhiteSuit, BrownSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue, BrownClue},
		},
		Variant{
			Name:  "White & Brown (5 Suits)",
			ID:    80,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, WhiteSuit, BrownSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, BrownClue},
		},
		Variant{
			Name:  "White & Brown (4 Suits)",
			ID:    81,
			Suits: []Suit{BlueSuit, GreenSuit, WhiteSuit, BrownSuit},
			Clues: []ColorClue{BlueClue, GreenClue, BrownClue},
		},
		Variant{
			Name:  "White & Brown (3 Suits)",
			ID:    82,
			Suits: []Suit{BlueSuit, WhiteSuit, BrownSuit},
			Clues: []ColorClue{BlueClue, BrownClue},
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
		Variant{
			Name:  "Black & Dark Rainbow (6 Suits)",
			ID:    12,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, BlackSuit, DarkRainbowSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue, BlackClue},
		},
		Variant{
			Name:  "White & Dark Rainbow (6 Suits)",
			ID:    83,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, WhiteSuit, DarkRainbowSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue},
		},
		Variant{
			Name:  "White & Dark Rainbow (5 Suits)",
			ID:    84,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, WhiteSuit, DarkRainbowSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue},
		},
		Variant{
			Name:  "Brown & Dark Rainbow (6 Suits)",
			ID:    85,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, BrownSuit, DarkRainbowSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue, BrownClue},
		},
		Variant{
			Name:  "Brown & Dark Rainbow (5 Suits)",
			ID:    86,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, BrownSuit, DarkRainbowSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, BrownClue},
		},

		// Gray
		Variant{
			Name:  "Gray (6 Suits)",
			ID:    59,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, PurpleSuit, GraySuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue, PurpleClue},
		},
		Variant{
			Name:  "Gray (5 Suits)",
			ID:    58,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, GraySuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue},
		},
		Variant{
			Name:  "Black and Gray (6 Suits)",
			ID:    60,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, BlackSuit, GraySuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue, BlackClue},
		},
		Variant{
			Name:  "Rainbow & Gray (6 Suits)",
			ID:    67,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, RainbowSuit, GraySuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue},
		},
		Variant{
			Name:  "Rainbow & Gray (5 Suits)",
			ID:    68,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RainbowSuit, GraySuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue},
		},
		Variant{
			Name:  "Brown & Gray (6 Suits)",
			ID:    87,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, BrownSuit, GraySuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue, BrownClue},
		},
		Variant{
			Name:  "Brown & Gray (5 Suits)",
			ID:    88,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, BrownSuit, GraySuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, BrownClue},
		},

		// Chocolate
		Variant{
			Name:  "Chocolate (6 Suits)",
			ID:    89,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, PurpleSuit, ChocolateSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue, PurpleClue, BrownClue},
		},
		Variant{
			Name:  "Chocolate (5 Suits)",
			ID:    90,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, ChocolateSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue, BrownClue},
		},
		Variant{
			Name:  "Black and Chocolate (6 Suits)",
			ID:    91,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, BlackSuit, ChocolateSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue, BlackClue, BrownClue},
		},
		Variant{
			Name:  "Rainbow & Chocolate (6 Suits)",
			ID:    92,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, RainbowSuit, ChocolateSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue, BrownClue},
		},
		Variant{
			Name:  "Rainbow & Chocolate (5 Suits)",
			ID:    93,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RainbowSuit, ChocolateSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, BrownClue},
		},
		Variant{
			Name:  "White & Chocolate (6 Suits)",
			ID:    94,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, WhiteSuit, ChocolateSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue, BrownClue},
		},
		Variant{
			Name:  "White & Chocolate (5 Suits)",
			ID:    95,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, WhiteSuit, ChocolateSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, BrownClue},
		},

		// Dark Mixes
		Variant{
			Name:  "Dark Rainbow & Gray (6 Suits)",
			ID:    62,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, DarkRainbowSuit, GraySuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue},
		},
		Variant{
			Name:  "Dark Rainbow & Chocolate (6 Suits)",
			ID:    96,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, DarkRainbowSuit, ChocolateSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue, BrownClue},
		},
		Variant{
			Name:  "Gray & Chocolate (6 Suits)",
			ID:    97,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, GraySuit, ChocolateSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue, BrownClue},
		},

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

		// Cow & Pig
		Variant{
			Name:  "Cow & Pig (6 Suits)",
			ID:    98,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, PurpleSuit, TealSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue, PurpleClue, TealClue},
		},
		Variant{
			Name:  "Cow & Pig (5 Suits)",
			ID:    99,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit, PurpleSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue, PurpleClue},
		},
		Variant{
			Name:  "Cow & Pig (4 Suits)",
			ID:    100,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit, RedSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue, RedClue},
		},
		Variant{
			Name:  "Cow & Pig (3 Suits)",
			ID:    101,
			Suits: []Suit{BlueSuit, GreenSuit, YellowSuit},
			Clues: []ColorClue{BlueClue, GreenClue, YellowClue},
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
