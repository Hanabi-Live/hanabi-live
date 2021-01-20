package tables

import (
	"context"
	"fmt"

	"github.com/Zamiell/hanabi-live/server/pkg/constants"
	"github.com/Zamiell/hanabi-live/server/pkg/models"
	"github.com/Zamiell/hanabi-live/server/pkg/options"
	"github.com/Zamiell/hanabi-live/server/pkg/types"
	"github.com/Zamiell/hanabi-live/server/pkg/variants"
)

type NewReplayData struct {
	userID   int
	username string
}

func (m *Manager) NewReplay(userID int, username string, d *NewReplayData) {
	d.userID = userID
	d.username = username
	m.newRequest(requestTypeNewReplay, d) // nolint: errcheck
}

func (m *Manager) newReplay(data interface{}) interface{} {
	var d *NewReplayData
	if v, ok := data.(*NewReplayData); !ok {
		m.logger.Errorf("Failed type assertion for data of type: %T", d)
		return &newTableReturnData{-1, false}
	} else {
		d = v
	}

	m.logger.Infof("%v", d.userID)

	return 1 // TODO
}

func (m *Manager) newReplayGetDatabaseOptions(
	userID int,
	databaseID int,
) (*options.Options, *options.ExtraOptions, []*models.DBPlayer, bool) {
	// Get the options from the database
	var opts *options.Options
	if v, err := m.models.Games.GetOptions(context.Background(), databaseID); err != nil {
		m.logger.Errorf(
			"Failed to get the options from the database for game %v: %v",
			databaseID,
			err,
		)
		m.Dispatcher.Sessions.NotifyError(userID, constants.CreateGameFail)
		return nil, nil, nil, false
	} else {
		opts = v
	}

	// Get the players from the database
	var dbPlayers []*models.DBPlayer
	if v, err := m.models.Games.GetPlayers(context.Background(), databaseID); err != nil {
		m.logger.Errorf(
			"Failed to get the players from the database for game %v: %v",
			databaseID,
			err,
		)
		return nil, nil, nil, false
	} else {
		dbPlayers = v
	}

	// As a sanity check, ensure that the number of game participants in the database matches the
	// number of players that are supposed to be in the game (according to the options)
	if len(dbPlayers) != opts.NumPlayers {
		m.logger.Errorf(
			"There are not enough game participants for game %v in the database. (There were %v player rows and there should be %v.)",
			databaseID,
			len(dbPlayers),
			opts.NumPlayers,
		)
		m.Dispatcher.Sessions.NotifyError(userID, constants.CreateGameFail)
		return nil, nil, nil, false
	}

	var characterAssignments []*options.CharacterAssignment
	if opts.DetrimentalCharacters {
		if v, err := m.newReplayGetCharacterAssignments(dbPlayers); err != nil {
			m.logger.Errorf(
				"Failed to get the character assignments for game %v in the database: %v",
				databaseID,
				err,
			)
			m.Dispatcher.Sessions.NotifyError(userID, constants.CreateGameFail)
			return nil, nil, nil, false
		} else {
			characterAssignments = v
		}
	}

	// Get the seed from the database
	var seed string
	if v, err := m.models.Games.GetSeed(context.Background(), databaseID); err != nil {
		m.logger.Errorf(
			"Failed to get the seed from the database for game %v: %v",
			databaseID,
			err,
		)
		m.Dispatcher.Sessions.NotifyError(userID, constants.CreateGameFail)
		return nil, nil, nil, false
	} else {
		seed = v
	}

	// Get the actions from the database
	var actions []*options.GameAction
	if v, err := m.models.GameActions.GetAll(context.Background(), databaseID); err != nil {
		m.logger.Errorf(
			"Failed to get the actions from the database for game %v: %v",
			databaseID,
			err,
		)
		m.Dispatcher.Sessions.NotifyError(userID, constants.CreateGameFail)
		return nil, nil, nil, false
	} else {
		actions = v
	}

	extraOpts := &options.ExtraOptions{ // nolint: exhaustivestruct
		DatabaseID:                 databaseID,
		NoWriteToDatabase:          true,
		CustomRequiredNumPlayers:   len(dbPlayers),
		CustomCharacterAssignments: characterAssignments,
		CustomSeed:                 seed,
		CustomActions:              actions,
	}

	return opts, extraOpts, dbPlayers, true
}

func (m *Manager) newReplayGetJSONOptions(
	userID int,
	g *types.GameJSON,
) (*options.Options, *options.ExtraOptions, bool) {
	// In order to avoid "runtime error: invalid memory address or nil pointer dereference",
	// we must explicitly check to see if all pointers exist
	startingPlayer := 0
	if g.Options.StartingPlayer != nil {
		startingPlayer = *g.Options.StartingPlayer
	}
	variantName := variants.DefaultVariantName
	if g.Options.VariantName != nil {
		variantName = *g.Options.VariantName
	}
	timed := false
	if g.Options.Timed != nil {
		timed = *g.Options.Timed
	}
	timeBase := 0
	if g.Options.Timed != nil {
		timeBase = *g.Options.TimeBase
	}
	timePerTurn := 0
	if g.Options.TimePerTurn != nil {
		timePerTurn = *g.Options.TimePerTurn
	}
	speedrun := false
	if g.Options.Speedrun != nil {
		speedrun = *g.Options.Speedrun
	}
	cardCycle := false
	if g.Options.CardCycle != nil {
		cardCycle = *g.Options.CardCycle
	}
	deckPlays := false
	if g.Options.DeckPlays != nil {
		deckPlays = *g.Options.DeckPlays
	}
	emptyClues := false
	if g.Options.EmptyClues != nil {
		emptyClues = *g.Options.EmptyClues
	}
	oneExtraCard := false
	if g.Options.OneExtraCard != nil {
		oneExtraCard = *g.Options.OneExtraCard
	}
	oneLessCard := false
	if g.Options.OneLessCard != nil {
		oneLessCard = *g.Options.OneLessCard
	}
	allOrNothing := false
	if g.Options.AllOrNothing != nil {
		allOrNothing = *g.Options.AllOrNothing
	}
	detrimentalCharacters := false
	if g.Options.DetrimentalCharacters != nil {
		detrimentalCharacters = *g.Options.DetrimentalCharacters
	}

	var variant *variants.Variant
	if v, err := m.Dispatcher.Variants.GetVariant(variantName); err != nil {
		msg := "The variant name of \"%v\" is invalid."
		m.Dispatcher.Sessions.NotifyWarning(userID, msg)
		return nil, nil, false
	} else {
		variant = v
	}

	// Store the options on the table
	// (the variant was already validated previously)
	opts := &options.Options{
		NumPlayers:            len(g.Players),
		StartingPlayer:        startingPlayer,
		VariantID:             variant.ID,
		VariantName:           variantName,
		Timed:                 timed,
		TimeBase:              timeBase,
		TimePerTurn:           timePerTurn,
		Speedrun:              speedrun,
		CardCycle:             cardCycle,
		DeckPlays:             deckPlays,
		EmptyClues:            emptyClues,
		OneExtraCard:          oneExtraCard,
		OneLessCard:           oneLessCard,
		AllOrNothing:          allOrNothing,
		DetrimentalCharacters: detrimentalCharacters,
	}

	extraOpts := &options.ExtraOptions{ // nolint: exhaustivestruct
		// Normally, "DatabaseID" is set to either -1 (in an ongoing game)
		// or a positive number (for a replay of a game in the database or a "!replay" game)
		// JSON games are hard-coded to have a database ID of 0
		DatabaseID: 0,

		NoWriteToDatabase: true,
		JSONReplay:        true,

		CustomRequiredNumPlayers: len(g.Players),
		// "d.GameJSON.Characters" is an optional element;
		// it will be an empty array if not specified
		CustomCharacterAssignments: g.Characters,
		// "d.GameJSON.Seed" is an optional element; it will be "" if not specified
		CustomSeed:    g.Seed,
		CustomDeck:    g.Deck,
		CustomActions: g.Actions,
	}

	return opts, extraOpts, true
}

func (m *Manager) newReplayGetCharacterAssignments(
	dbPlayers []*models.DBPlayer,
) ([]*options.CharacterAssignment, error) {
	characterAssignments := make([]*options.CharacterAssignment, 0)
	for _, dbPlayer := range dbPlayers {
		// Characters are stored in the database as integers,
		// so we convert it to the character name by using the character ID map
		var name string
		if v, err := m.Dispatcher.Characters.GetCharacterByID(
			dbPlayer.CharacterAssignment,
		); err != nil {
			return nil, err
		} else {
			name = v.Name
		}

		characterAssignments = append(characterAssignments, &options.CharacterAssignment{
			Name: name,
			// Character metadata is stored in the database as value + 1
			// (so that a value of 0 does not look like a null value)
			Metadata: dbPlayer.CharacterMetadata - 1,
		})
	}

	return characterAssignments, nil
}

// TODO: reorder this function somewhere when the file is complete (?)
func (m *Manager) newReplayValidateJSON(g *types.GameJSON) (bool, string) {
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
	if v, err := m.Dispatcher.Variants.GetVariant(*g.Options.VariantName); err != nil {
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
