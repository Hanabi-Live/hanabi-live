package table

import (
	"fmt"

	"github.com/Zamiell/hanabi-live/server/pkg/constants"
	"github.com/Zamiell/hanabi-live/server/pkg/dispatcher"
	"github.com/Zamiell/hanabi-live/server/pkg/options"
	"github.com/Zamiell/hanabi-live/server/pkg/variants"
)

type GameJSON struct {
	ID      int                     `json:"id,omitempty"` // Optional element only used for game exports
	Players []string                `json:"players"`
	Deck    []*options.CardIdentity `json:"deck"`
	Actions []*options.GameAction   `json:"actions"`
	// Options is an optional element
	// Thus, it must be a pointer so that we can tell if the value was specified or not
	Options *options.JSON `json:"options,omitempty"`
	// Notes is an optional element that contains the notes for each player
	Notes [][]string `json:"notes,omitempty"`
	// Characters is an optional element that specifies the "Detrimental Character" assignment for
	// each player, if any
	Characters []*options.CharacterAssignment `json:"characters,omitempty"`
	// Seed is an optional value that specifies the server-side seed for the game (e.g. "p2v0s1")
	// This allows the server to reconstruct the game without the deck being present and to properly
	// write the game back to the database
	Seed string `json:"seed,omitempty"`
}

func (g *GameJSON) Validate(variantsManager dispatcher.VariantsManager) (bool, string) {
	if g == nil {
		msg := "You must send the game specification in the \"gameJSON\" field."
		return false, msg
	}

	// All options are optional; specify defaults if they were not specified
	if g.Options == nil {
		g.Options = &options.JSON{} // Initializes it with all nil pointers
	}
	if g.Options.VariantName == nil {
		variantText := variants.DefaultVariantName
		g.Options.VariantName = &variantText
	}

	// Validate that the specified variant exists
	var variant *variants.Variant
	if v, err := variantsManager.GetVariant(*g.Options.VariantName); err != nil {
		msg := fmt.Sprintf("\"%v\" is not a valid variant.", *g.Options.VariantName)
		return false, msg
	} else {
		variant = v
	}

	// Validate that there is at least one action
	if len(g.Actions) < 1 {
		msg := "There must be at least one game action in the JSON array."
		return false, msg
	}

	// Validate actions
	for i, action := range g.Actions {
		switch action.Type {
		case constants.ActionTypePlay, constants.ActionTypeDiscard:
			if action.Target < 0 || action.Target > len(g.Deck)-1 {
				msg := fmt.Sprintf(
					"Action at index %v is a play or discard with an invalid target (card order) of: %v",
					i,
					action.Target,
				)
				return false, msg
			}

			if action.Value != 0 {
				msg := fmt.Sprintf(
					"Action at index %v is a play or discard with a value of %v, which is nonsensical.",
					i,
					action.Value,
				)
				return false, msg
			}

		case constants.ActionTypeColorClue, constants.ActionTypeRankClue:
			if action.Target < 0 || action.Target > len(g.Players)-1 {
				msg := fmt.Sprintf(
					"Action at index %v is a clue with an invalid target (player index) of: %v",
					i,
					action.Target,
				)
				return false, msg
			}

			if action.Type == constants.ActionTypeColorClue {
				if action.Value < 0 || action.Value > len(variant.ClueColors) {
					msg := fmt.Sprintf(
						"Action at index %v is a color clue with an invalid value of: %v",
						i,
						action.Value,
					)
					return false, msg
				}
			} else if action.Type == constants.ActionTypeRankClue {
				if action.Value < 1 || action.Value > 5 {
					msg := fmt.Sprintf(
						"Action at index %v is a rank clue with an invalid value of: %v",
						i,
						action.Value,
					)
					return false, msg
				}
			}

		case constants.ActionTypeEndGame:
			if action.Target < 0 || action.Target > len(g.Players)-1 {
				msg := fmt.Sprintf(
					"Action at index %v is an end game with an invalid target (player index) of: %v",
					i,
					action.Target,
				)
				return false, msg
			}

		default:
			msg := fmt.Sprintf("Action at index %v has an invalid type of: %v", i, action.Type)
			return false, msg
		}
	}

	// Validate the deck
	deckSize := variant.GetDeckSize()
	if len(g.Deck) != deckSize {
		msg := fmt.Sprintf("The deck must have %v cards in it.", deckSize)
		return false, msg
	}
	for i, card := range g.Deck {
		if card.SuitIndex < 0 || card.SuitIndex > len(variant.Suits)-1 {
			msg := fmt.Sprintf(
				"The card at index %v has an invalid suit number of: %v",
				i,
				card.SuitIndex,
			)
			return false, msg
		}
		if (card.Rank < 1 || card.Rank > 5) && card.Rank != variants.StartCardRank {
			msg := fmt.Sprintf(
				"The card at index %v has an invalid rank number of: %v",
				i,
				card.Rank,
			)
			return false, msg
		}
	}

	// Validate the amount of players
	if len(g.Players) < 2 || len(g.Players) > 6 {
		msg := "The number of players must be between 2 and 6."
		return false, msg
	}

	// Validate the notes
	if len(g.Notes) == 0 {
		// They did not provide any notes, so create a blank note array
		g.Notes = make([][]string, len(g.Players))
		for i := 0; i < len(g.Players); i++ {
			g.Notes[i] = make([]string, deckSize)
		}
	} else if len(g.Notes) != len(g.Players) {
		msg := "The number of note arrays must match the number of players."
		return false, msg
	} else {
		for i, playerNotes := range g.Notes {
			// We add the number of suits to account for notes on the stack bases
			maxSize := deckSize + len(variant.Suits)
			if len(playerNotes) > maxSize {
				msg := fmt.Sprintf(
					"The note array at index %v has too many notes; it must have at most: %v",
					i,
					maxSize,
				)
				return false, msg
			}

			// If a note array is empty or does not have enough notes, fill them up with blank notes
			for len(playerNotes) < maxSize {
				playerNotes = append(playerNotes, "")
			}
		}
	}

	// Validate the characters
	if g.Options.DetrimentalCharacters != nil &&
		len(g.Characters) != len(g.Players) {

		msg := "The amount of characters specified must match the number of players in the game."
		return false, msg
	}

	return true, ""
}
