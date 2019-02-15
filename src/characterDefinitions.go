package main

var (
	characterDefinitions = []Character{
		// Clue restriction characters
		Character{
			Name:        "Fuming",
			ID:          0,
			Description: "Can only clue numbers and [random color]",
			Emoji:       "🌋",
		},
		Character{
			Name:        "Dumbfounded",
			ID:          1,
			Description: "Can only clue colors and [random number]",
			Emoji:       "🤯",
		},
		Character{
			Name:        "Inept",
			ID:          2,
			Description: "Cannot give any clues that touch [random color] cards",
			Emoji:       "️🤔",
		},
		Character{
			Name:        "Awkward",
			ID:          3,
			Description: "Cannot give any clues that touch [random number]s",
			Emoji:       "️😬",
		},
		Character{
			Name:        "Conservative",
			ID:          4,
			Description: "Can only give clues that touch a single card",
			Emoji:       "🕇",
		},
		Character{
			Name:        "Greedy",
			ID:          5,
			Description: "Can only give clues that touch 2+ cards",
			Emoji:       "🤑",
		},
		Character{
			Name:        "Picky",
			ID:          6,
			Description: "Can only clue odd numbers or odd colors",
			Emoji:       "🤢",
		},
		Character{
			Name:        "Spiteful",
			ID:          7,
			Description: "Cannot clue the player to their left",
			Emoji:       "😈",
			Not2P:       true,
		},
		Character{
			Name:        "Insolent",
			ID:          8,
			Description: "Cannot clue the player to their right",
			Emoji:       "😏",
			Not2P:       true,
		},
		Character{
			Name:        "Vindictive",
			ID:          9,
			Description: "Must clue if they received a clue since their last turn",
			Emoji:       "🗡️",
		},
		Character{
			Name:        "Miser",
			ID:          10,
			Description: "Can only clue if there are 4 or more clues available",
			Emoji:       "💰",
		},
		Character{
			Name:        "Compulsive",
			ID:          11,
			Description: "Can only clue if it touches the newest or oldest card in someone's hand",
			Emoji:       "📺",
		},
		Character{
			Name:        "Mood Swings",
			ID:          12,
			Description: "Clues given must alternate between color and number",
			Emoji:       "👧",
		},
		Character{
			Name:        "Insistent",
			ID:          13,
			Description: "Must continue to clue cards until one of them is played or discarded",
			Emoji:       "😣",
		},

		// Clue restriction characters (receiving)
		Character{
			Name:        "Vulnerable",
			ID:          14,
			Description: "Cannot receive a number 2 or number 5 clue",
			Emoji:       "🛡️",
		},
		Character{
			Name:        "Color-Blind",
			ID:          15,
			Description: "Cannot receive a color clue",
			Emoji:       "️👓",
		},

		// Play restriction characters
		Character{
			Name:        "Follower",
			ID:          67,
			Description: "Cannot play a card unless two cards of the same rank have already been played",
			Emoji:       "👁️",
		},
		Character{
			Name:        "Impulsive",
			ID:          17,
			Description: "Must play slot 1 if it has been clued",
			Emoji:       "️💉",
		},
		Character{
			Name:        "Indolent",
			ID:          18,
			Description: "Cannot play a card if they played on the last round",
			Emoji:       "️💺",
		},
		Character{
			Name:        "Hesitant",
			ID:          19,
			Description: "Cannot play cards from slot 1",
			Emoji:       "️️👴🏻",
		},

		// Discard restriction characters
		Character{
			Name:        "Anxious",
			ID:          21,
			Description: "Cannot discard if there is an even number of clues available (including 0)",
			Emoji:       "😰",
		},
		Character{
			Name:        "Traumatized",
			ID:          22,
			Description: "Cannot discard if there is an odd number of clues available",
			Emoji:       "😨",
		},
		Character{
			Name:        "Wasteful",
			ID:          23,
			Description: "Cannot discard if there are 2 or more clues available",
			Emoji:       "🗑️",
		},

		// Extra turn characters
		Character{
			Name:        "Genius",
			ID:          24,
			Description: "Must clue both a number and a color (uses 2 clues)",
			Emoji:       "🧠",
		},
		Character{
			Name:        "Synesthetic",
			ID:          25,
			Description: "Must clue both a number and a color of the same value (uses 1 clue)",
			Emoji:       "🎨",
		},
		Character{
			Name:        "Panicky",
			ID:          26,
			Description: "When discarding, discards twice if 4 clues or less",
			Emoji:       "😳",
		},

		// Other
		Character{
			Name:        "Contrarian",
			ID:          27,
			Description: "Play order inverts after taking a turn, 2-turn end game",
			Emoji:       "🙅",
			Not2P:       true,
		},
		Character{
			Name:        "Stubborn",
			ID:          28,
			Description: "Must perform a different action type than the player that came before them",
			Emoji:       "😠",
		},
		Character{
			Name:        "Blind Spot",
			ID:          29,
			Description: "Cannot see the cards of the player to their left",
			Emoji:       "🚗",
			Not2P:       true,
		},
		Character{
			Name:        "Oblivious",
			ID:          30,
			Description: "Cannot see the cards of the player to their right",
			Emoji:       "🚂",
			Not2P:       true,
		},
		/*
			Character{
				Name:        "Forgetful",
				ID:          31,
				Description: "Hand is shuffled after discarding (but before drawing)",
				Emoji:       "🔀",
			},
		*/
	}
)
