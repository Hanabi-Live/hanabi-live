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
	OrangeClue = ColorClue{Name: "Orange"}
	BlackClue  = ColorClue{Name: "Black"}

	// Helpers used for some variants
	allColorClues = []ColorClue{BlueClue, GreenClue, YellowClue, RedClue, PurpleClue, OrangeClue, BlackClue}
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
	OrangeSuit     = NewSuit("Orange", []ColorClue{OrangeClue})
	BlackSuit      = NewSuit1oE("Black", []ColorClue{BlackClue})
	RainbowSuit    = NewSuit("Rainbow", allColorClues)
	WhiteSuit      = NewSuit("White", noColorClues)
	Rainbow1oESuit = NewSuit1oE("Rainbow", allColorClues)

	// For "Color Blind"
	BlindBlueSuit   = NewSuit("Blue", noColorClues)
	BlindGreenSuit  = NewSuit("Green", noColorClues)
	BlindYellowSuit = NewSuit("Yellow", noColorClues)
	BlindRedSuit    = NewSuit("Red", noColorClues)
	BlindPurpleSuit = NewSuit("Purple", noColorClues)
	BlindOrangeSuit = NewSuit("Orange", noColorClues)

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
	IndigoDualSuit   = NewSuit("Indigo", []ColorClue{BlueClue, PurpleClue})
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
				log.Fatal("Variant \"" + variant.Name + "\" and \"" + variant2.Name + "\" have the same ID (" + strconv.Itoa(variant.ID) + ").")
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

func variantGetHighestID() int {
	highestID := 0
	for _, v := range variantDefinitions {
		if v.ID > highestID {
			highestID = v.ID
		}
	}
	return highestID
}

/*
	"Up or Down" functions
*/

func variantUpOrDownPlay(g *Game, c *Card) bool {
	if g.StackDirections[c.Suit] == stackDirectionUndecided {
		// If the stack direction is undecided,
		// then there is either no cards played or a "START" card has been played
		if g.Stacks[c.Suit] == 0 {
			// No cards have been played yet on this stack
			failed := c.Rank != 0 && c.Rank != 1 && c.Rank != 5

			// Set the stack direction
			if !failed {
				if c.Rank == 1 {
					g.StackDirections[c.Suit] = stackDirectionUp
				} else if c.Rank == 5 {
					g.StackDirections[c.Suit] = stackDirectionDown
				}
			}
		} else if g.Stacks[c.Suit] == -1 {
			// The "START" card has been played
			failed := c.Rank != 2 && c.Rank != 4

			// Set the stack direction
			if !failed {
				if c.Rank == 2 {
					g.StackDirections[c.Suit] = stackDirectionUp
				} else if c.Rank == 4 {
					g.StackDirections[c.Suit] = stackDirectionDown
				}
			}
		}

	} else if g.StackDirections[c.Suit] == stackDirectionUp {
		failed := c.Rank != g.Stacks[c.Suit]+1

		// Set the stack direction
		if !failed && c.Rank == 5 {
			g.StackDirections[c.Suit] = stackDirectionFinished
		}

	} else if g.StackDirections[c.Suit] == stackDirectionDown {
		failed := c.Rank != g.Stacks[c.Suit]-1

		// Set the stack direction
		if !failed && c.Rank == 1 {
			g.StackDirections[c.Suit] = stackDirectionFinished
		}

	} else if g.StackDirections[c.Suit] == stackDirectionFinished {
		// Once a stack is finished, any card that is played will fail to play
		return true
	}

	// Default case; we should never get here
	return true
}

// variantUpOrDownIsDead returns true if it is no longer possible to play this card
// (taking into account the stack direction)
func variantUpOrDownIsDead(g *Game, c *Card) bool {
	// It is not possible for a card to be dead if the stack is already finished
	if g.StackDirections[c.Suit] == stackDirectionFinished {
		return false
	}

	// Compile a list of the preceding cards
	ranksToCheck := make([]int, 0)
	if g.StackDirections[c.Suit] == stackDirectionUndecided {
		// Since the stack direction is undecided,
		// this card will only be dead if all three of the starting cards are discarded
		// (we assume that there is only one of each, e.g. one 1, one 5, and one START card)
		ranksToCheck = []int{0, 1, 5}
		for i := range ranksToCheck {
			for _, deckCard := range g.Deck {
				if deckCard.Suit == c.Suit && deckCard.Rank == i && !deckCard.Discarded {
					return false
				}
			}
		}
		return true

	} else if g.StackDirections[c.Suit] == stackDirectionUp {
		for i := 1; i < c.Rank; i++ {
			ranksToCheck = append(ranksToCheck, i)
		}

	} else if g.StackDirections[c.Suit] == stackDirectionDown {
		for i := 5; i > c.Rank; i-- {
			ranksToCheck = append(ranksToCheck, i)
		}
	}

	// Check to see if all of the preceding cards have been discarded
	for i := range ranksToCheck {
		total, discarded := g.GetSpecificCardNum(c.Suit, i)
		if total == discarded {
			// The suit is "dead"
			return true
		}
	}

	return false
}
