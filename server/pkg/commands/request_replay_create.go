package commands

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/Zamiell/hanabi-live/server/pkg/models"
	"github.com/Zamiell/hanabi-live/server/pkg/util"
	"github.com/Zamiell/hanabi-live/server/pkg/variants"
)

// commandReplayCreate is sent when the user clicks on the "Watch Replay", "Share Replay",
// or "Watch Specific Replay" button
// It means that they want to view the replay of a game from the database or that they are
// submitting arbitrary actions from a hypothetical game
// In order to derive the JSON actions to send to the client,
// we need to play through a mock game using these actions
//
// Example data:
// {
//   source: 'id',
//   databaseID: 15103, // Only if source is "id"
//   json: '{"actions"=[],"deck"=[]}', // Only if source is "json"
//   visibility: 'solo', // Can also be "shared"
// }
func commandReplayCreate(ctx context.Context, s *Session, d *CommandData) {
	// Validate that there is not a password
	if d.Password != "" {
		s.Warning("You cannot create a replay with a password.")
		return
	}

	// Validate the visibility
	if d.Visibility != "solo" && d.Visibility != "shared" {
		s.Warning("That is not a valid replay visibility.")
		return
	}

	if d.Source == "id" {
		// Before creating a new game and emulating the actions,
		// ensure that the ID exists in the database
		if !validateDatabase(s, d) {
			return
		}
	} else if d.Source == "json" {
		// Before creating a new game and emulating the actions,
		// ensure that the submitted JSON does not have any obvious errors
		if !validateJSON(s, d) {
			return
		}
	}

	replayCreate(ctx, s, d)
}

func replayCreate(ctx context.Context, s *Session, d *CommandData) {
	// Since this is a function that changes a user's relationship to tables,
	// we must acquires the tables lock to prevent race conditions
	if !d.NoTablesLock {
		tables.Lock(ctx)
		defer tables.Unlock(ctx)
	}

	// Validate that the player is not spectating another table
	// (this cannot be in the "commandReplayCreate()" function because we need the tables lock)
	if len(tables.GetTablesUserSpectating(s.UserID)) > 0 {
		s.Warning("You cannot spectate more than one table at a time. Leave your other table before creating a new replay.")
		return
	}

	// If this is a replay of a game in the database,
	// validate that there is not another table open with this table ID
	// For simplicity, we only allow one shared replay of the same table ID at once
	// (commented out for now since it causes race conditions)
	/*
		if d.Source == "id" {
			tableList := tables.GetList(false)
			for _, t := range tableList {
				if t.Replay && t.Visible && t.ExtraOptions.DatabaseID == d.DatabaseID {
					commandTableSpectate(ctx, s, &CommandData{ // nolint: exhaustivestruct
						TableID:              t.ID,
						ShadowingPlayerIndex: -1,
						NoTablesLock:         true,
					})
					return
				}
			}
		}
	*/

	// Generate the name for the table
	var gameDescription string
	if d.Source == "id" {
		gameDescription = fmt.Sprintf("game #%v", d.DatabaseID)
	} else if d.Source == "json" {
		usernamePossessive := s.Username + "'"
		if !strings.HasSuffix(s.Username, "s") {
			usernamePossessive += "s"
		}
		gameDescription = fmt.Sprintf("%v JSON game", usernamePossessive)
	}
	name := fmt.Sprintf("%v replay for %v", strings.Title(d.Visibility), gameDescription)

	// Create a table
	t := NewTable(name, -1)
	t.Lock(ctx)
	defer t.Unlock(ctx)
	t.Visible = d.Visibility == "shared"

	// Load the options and players
	if d.Source == "id" {
		var dbPlayers []*DBPlayer
		if v, success := loadDatabaseOptionsToTable(s, d.DatabaseID, t); !success {
			return
		} else {
			dbPlayers = v
		}

		playerNames := make([]string, 0)
		for _, dbPlayer := range dbPlayers {
			playerNames = append(playerNames, dbPlayer.Name)
		}

		loadFakePlayers(t, playerNames)
	} else if d.Source == "json" {
		loadJSONOptionsToTable(d, t)
		loadFakePlayers(t, d.GameJSON.Players)
	}

	// Add the table to a map so that we can keep track of all of the active tables
	tables.Set(t.ID, t)

	var replayString string
	if d.Source == "id" {
		replayString = fmt.Sprintf("replay for game %v", d.DatabaseID)
	} else if d.Source == "json" {
		replayString = "JSON replay"
	}

	hLog.Infof(
		"%v %v created a new %v %v.",
		t.GetName(),
		util.PrintUserCapitalized(s.UserID, s.Username),
		d.Visibility,
		replayString,
	)
	// (a "table" message will be sent in the "commandTableSpectate" function below)

	// Start the (fake) game
	commandTableStart(ctx, t.Players[0].Session, &CommandData{ // nolint: exhaustivestruct
		TableID:      t.ID,
		NoTableLock:  true,
		NoTablesLock: true,
	})
	g := t.Game
	if g == nil {
		hLog.Errorf("Failed to start the game after loading database game: %v", d.DatabaseID)
		s.Error(InitGameFail)
		deleteTable(t)
		return
	}

	if !applyNotesToPlayers(s, d, g) {
		deleteTable(t)
		return
	}

	// Handle custom code that is creating replays with no associated session
	// (e.g. only testing for errors when emulating the actions)
	if s == nil {
		deleteTable(t)
		return
	}

	// Do a mini-version of the steps in the "g.End()" function
	t.Replay = true
	g.EndTurn = g.Turn
	g.Turn = 0 // We want to start viewing the replay at the beginning, not the end
	t.Progress = 0

	if d.Source == "id" {
		// Fill in the DatetimeStarted and DatetimeFinished" values from the database
		if v1, v2, err := models.Games.GetDatetimes(t.ExtraOptions.DatabaseID); err != nil {
			hLog.Errorf(
				"Failed to get the datetimes for game %v: %v",
				t.ExtraOptions.DatabaseID,
				err,
			)
			s.Error(InitGameFail)
			deleteTable(t)
			return
		} else {
			g.DatetimeStarted = v1
			g.DatetimeFinished = v2
		}
	}

	// Join the user to the new replay
	commandTableSpectate(ctx, s, &CommandData{ // nolint: exhaustivestruct
		TableID:              t.ID,
		ShadowingPlayerIndex: -1,
		NoTableLock:          true,
		NoTablesLock:         true,
	})
	t.OwnerID = s.UserID

	// Start the idle timeout
	go t.CheckIdle(ctx)

	// The "commandTableSpectate()" function above sends the user the "tableStart" message
	// After the client receives the "tableStart" message, they will send a "getGameInfo1" command
	// to begin the process of loading the UI and putting them in the game
}

func validateDatabase(s *Session, d *CommandData) bool {
	// Check to see if the game exists in the database
	if exists, err := models.Games.Exists(d.DatabaseID); err != nil {
		hLog.Errorf("Failed to check to see if database ID %v exists: %v", d.DatabaseID, err)
		s.Error(InitGameFail)
		return false
	} else if !exists {
		s.Warningf("Game %v does not exist in the database.", d.DatabaseID)
		return false
	}

	return true
}

func validateJSON(s *Session, d *CommandData) bool {
	if d.GameJSON == nil {
		s.Warning("You must send the game specification in the \"gameJSON\" field.")
		return false
	}

	// All options are optional; specify defaults if they were not specified
	if d.GameJSON.Options == nil {
		d.GameJSON.Options = &OptionsJSON{}
	}
	if d.GameJSON.Options.Variant == nil {
		variantText := variants.DefaultVariantName
		d.GameJSON.Options.Variant = &variantText
	}

	// Validate that the specified variant exists
	var variant *Variant
	if v, ok := variants[*d.GameJSON.Options.Variant]; !ok {
		s.Warningf("\"%v\" is not a valid variant.", *d.GameJSON.Options.Variant)
		return false
	} else {
		variant = v
	}

	// Validate that there is at least one action
	if len(d.GameJSON.Actions) < 1 {
		s.Warning("There must be at least one game action in the JSON array.")
		return false
	}

	// Validate actions
	for i, action := range d.GameJSON.Actions {
		if action.Type == ActionTypePlay || action.Type == ActionTypeDiscard {
			if action.Target < 0 || action.Target > len(d.GameJSON.Deck)-1 {
				s.Warningf(
					"Action at index %v is a play or discard with an invalid target (card order) of: %v",
					i,
					action.Target,
				)
				return false
			}
			if action.Value != 0 {
				s.Warningf(
					"Action at index %v is a play or discard with a value of %v, which is nonsensical.",
					i,
					action.Value,
				)
				return false
			}
		} else if action.Type == ActionTypeColorClue || action.Type == ActionTypeRankClue {
			if action.Target < 0 || action.Target > len(d.GameJSON.Players)-1 {
				s.Warningf(
					"Action at index %v is a clue with an invalid target (player index) of: %v",
					i,
					action.Target,
				)
				return false
			}
			if action.Type == ActionTypeColorClue {
				if action.Value < 0 || action.Value > len(variant.ClueColors) {
					s.Warningf(
						"Action at index %v is a color clue with an invalid value of: %v",
						i,
						action.Value,
					)
					return false
				}
			} else if action.Type == ActionTypeRankClue {
				if action.Value < 1 || action.Value > 5 {
					s.Warningf(
						"Action at index %v is a rank clue with an invalid value of: %v",
						i,
						action.Value,
					)
					return false
				}
			}
		} else if action.Type == ActionTypeEndGame {
			if action.Target < 0 || action.Target > len(d.GameJSON.Players)-1 {
				s.Warningf(
					"Action at index %v is an end game with an invalid target (player index) of: %v",
					i,
					action.Target,
				)
				return false
			}
		} else {
			s.Warningf("Action at index %v has an invalid type of: %v", i, action.Type)
			return false
		}
	}

	// Validate the deck
	deckSize := variant.GetDeckSize()
	if len(d.GameJSON.Deck) != deckSize {
		s.Warningf("The deck must have %v cards in it.", deckSize)
		return false
	}
	for i, card := range d.GameJSON.Deck {
		if card.SuitIndex < 0 || card.SuitIndex > len(variant.Suits)-1 {
			s.Warningf(
				"The card at index %v has an invalid suit number of: %v",
				i,
				card.SuitIndex,
			)
			return false
		}
		if (card.Rank < 1 || card.Rank > 5) && card.Rank != StartCardRank {
			s.Warningf(
				"The card at index %v has an invalid rank number of: %v",
				i,
				card.Rank,
			)
			return false
		}
	}

	// Validate the amount of players
	if len(d.GameJSON.Players) < 2 || len(d.GameJSON.Players) > 6 {
		s.Warning("The number of players must be between 2 and 6.")
		return false
	}

	// Validate the notes
	if len(d.GameJSON.Notes) == 0 {
		// They did not provide any notes, so create a blank note array
		d.GameJSON.Notes = make([][]string, len(d.GameJSON.Players))
		for i := 0; i < len(d.GameJSON.Players); i++ {
			d.GameJSON.Notes[i] = make([]string, deckSize)
		}
	} else if len(d.GameJSON.Notes) != len(d.GameJSON.Players) {
		s.Warning("The number of note arrays must match the number of players.")
		return false
	} else {
		for i, playerNotes := range d.GameJSON.Notes {
			// We add the number of suits to account for notes on the stack bases
			maxSize := deckSize + len(variant.Suits)
			if len(playerNotes) > maxSize {
				s.Warningf(
					"The note array at index %v has too many notes; it must have at most: %v",
					i,
					maxSize,
				)
				return false
			}

			// If a note array is empty or does not have enough notes, fill them up with blank notes
			for len(playerNotes) < maxSize {
				playerNotes = append(playerNotes, "")
			}
		}
	}

	// Validate the characters
	if d.GameJSON.Options.DetrimentalCharacters != nil &&
		len(d.GameJSON.Characters) != len(d.GameJSON.Players) {

		s.Warning("The amount of characters specified must match the number of players in the game.")
		return false
	}

	return true
}

func loadDatabaseOptionsToTable(s *Session, databaseID int, t *Table) ([]*DBPlayer, bool) {
	// Get the options from the database
	if v, err := models.Games.GetOptions(databaseID); err != nil {
		hLog.Errorf(
			"Failed to get the options from the database for game %v: %v",
			databaseID,
			err,
		)
		s.Error(InitGameFail)
		return nil, false
	} else {
		t.Options = v
	}

	// Get the players from the database
	var dbPlayers []*DBPlayer
	if v, err := models.Games.GetPlayers(databaseID); err != nil {
		hLog.Errorf(
			"Failed to get the players from the database for game %v: %v",
			databaseID,
			err,
		)
		return nil, false
	} else {
		dbPlayers = v
	}

	// As a sanity check, ensure that the number of game participants in the database matches the
	// number of players that are supposed to be in the game (according to the options)
	if len(dbPlayers) != t.Options.NumPlayers {
		hLog.Errorf(
			"There are not enough game participants for game %v in the database. (There were %v player rows and there should be %v.)",
			databaseID,
			len(dbPlayers),
			t.Options.NumPlayers,
		)
		s.Error(InitGameFail)
		return nil, false
	}

	var characterAssignments []*CharacterAssignment
	if t.Options.DetrimentalCharacters {
		characterAssignments = getCharacterAssignmentsFromDBPlayers(dbPlayers)
	}

	// Get the seed from the database
	var seed string
	if v, err := models.Games.GetSeed(databaseID); err != nil {
		hLog.Errorf(
			"Failed to get the seed from the database for game %v: %v",
			databaseID,
			err,
		)
		s.Error(InitGameFail)
		return nil, false
	} else {
		seed = v
	}

	// Get the actions from the database
	var actions []*GameAction
	if v, err := models.GameActions.GetAll(databaseID); err != nil {
		hLog.Errorf(
			"Failed to get the actions from the database for game %v: %v",
			databaseID,
			err,
		)
		s.Error(InitGameFail)
		return nil, false
	} else {
		actions = v
	}

	t.ExtraOptions = &ExtraOptions{
		DatabaseID: databaseID,

		NoWriteToDatabase: true,
		JSONReplay:        false,

		CustomNumPlayers:           len(dbPlayers),
		CustomCharacterAssignments: characterAssignments,
		CustomSeed:                 seed,
		// Setting "CustomDeck" is not necessary because the deck is not stored in the database;
		// the ordering of the cards is determined by using the game's seed
		CustomDeck:    nil,
		CustomActions: actions,

		Restarted:     false,
		SetSeedSuffix: "",
		SetReplay:     false,
		SetReplayTurn: 0,
	}

	return dbPlayers, true
}

func getCharacterAssignmentsFromDBPlayers(dbPlayers []*DBPlayer) []*CharacterAssignment {
	characterAssignments := make([]*CharacterAssignment, 0)
	for _, dbPlayer := range dbPlayers {
		characterAssignments = append(characterAssignments, &CharacterAssignment{
			// Characters are stored in the database as integers,
			// so we convert it to the character name by using the character ID map
			Name: characterIDMap[dbPlayer.CharacterAssignment],
			// Character metadata is stored in the database as value + 1
			Metadata: dbPlayer.CharacterMetadata - 1,
		})
	}

	return characterAssignments
}

func loadJSONOptionsToTable(d *CommandData, t *Table) {
	// In order to avoid "runtime error: invalid memory address or nil pointer dereference",
	// we must explicitly check to see if all pointers exist
	startingPlayer := 0
	if d.GameJSON.Options.StartingPlayer != nil {
		startingPlayer = *d.GameJSON.Options.StartingPlayer
	}
	variantName := variants.DefaultVariantName
	if d.GameJSON.Options.Variant != nil {
		variantName = *d.GameJSON.Options.Variant
	}
	timed := false
	if d.GameJSON.Options.Timed != nil {
		timed = *d.GameJSON.Options.Timed
	}
	timeBase := 0
	if d.GameJSON.Options.Timed != nil {
		timeBase = *d.GameJSON.Options.TimeBase
	}
	timePerTurn := 0
	if d.GameJSON.Options.TimePerTurn != nil {
		timePerTurn = *d.GameJSON.Options.TimePerTurn
	}
	speedrun := false
	if d.GameJSON.Options.Speedrun != nil {
		speedrun = *d.GameJSON.Options.Speedrun
	}
	cardCycle := false
	if d.GameJSON.Options.CardCycle != nil {
		cardCycle = *d.GameJSON.Options.CardCycle
	}
	deckPlays := false
	if d.GameJSON.Options.DeckPlays != nil {
		deckPlays = *d.GameJSON.Options.DeckPlays
	}
	emptyClues := false
	if d.GameJSON.Options.EmptyClues != nil {
		emptyClues = *d.GameJSON.Options.EmptyClues
	}
	oneExtraCard := false
	if d.GameJSON.Options.OneExtraCard != nil {
		oneExtraCard = *d.GameJSON.Options.OneExtraCard
	}
	oneLessCard := false
	if d.GameJSON.Options.OneLessCard != nil {
		oneLessCard = *d.GameJSON.Options.OneLessCard
	}
	allOrNothing := false
	if d.GameJSON.Options.AllOrNothing != nil {
		allOrNothing = *d.GameJSON.Options.AllOrNothing
	}
	detrimentalCharacters := false
	if d.GameJSON.Options.DetrimentalCharacters != nil {
		detrimentalCharacters = *d.GameJSON.Options.DetrimentalCharacters
	}

	// Store the options on the table
	// (the variant was already validated in the "validateJSON()" function)
	t.Options = &Options{
		NumPlayers:            len(d.GameJSON.Players),
		StartingPlayer:        startingPlayer,
		VariantID:             variants[variantName].ID,
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
	t.ExtraOptions = &ExtraOptions{
		// Normally, "DatabaseID" is set to either -1 (in an ongoing game)
		// or a positive number (for a replay of a game in the database or a "!replay" game)
		// JSON games are hard-coded to have a database ID of 0
		DatabaseID: 0,

		NoWriteToDatabase: true,
		JSONReplay:        true,

		CustomNumPlayers: len(d.GameJSON.Players),
		// "d.GameJSON.Characters" is an optional element;
		// it will be an empty array if not specified
		CustomCharacterAssignments: d.GameJSON.Characters,
		// "d.GameJSON.Seed" is an optional element; it will be "" if not specified
		CustomSeed:    d.GameJSON.Seed,
		CustomDeck:    d.GameJSON.Deck,
		CustomActions: d.GameJSON.Actions,

		Restarted:     false,
		SetSeedSuffix: "",
		SetReplay:     false,
		SetReplayTurn: 0,
	}
}

func loadFakePlayers(t *Table, playerNames []string) {
	// Convert the JSON player objects to Player objects
	for i, name := range playerNames {
		// The session ID and the user ID can be any arbitrary unique number,
		// but we set them to -1, -2, etc., so that they will not overlap with any valid user IDs
		id := (i + 1) * -1

		player := &Player{
			UserID:    id,
			Name:      name,
			Session:   NewFakeSession(id, name),
			Present:   true,
			Stats:     &PregameStats{},
			Typing:    false,
			LastTyped: time.Time{},
		}
		t.Players = append(t.Players, player)
	}
}

func applyNotesToPlayers(s *Session, d *CommandData, g *Game) bool {
	var notes [][]string
	if d.Source == "id" {
		// Get the notes from the database
		variant := variants[g.Options.VariantName]
		noteSize := variant.GetDeckSize() + len(variant.Suits)
		if v, err := models.Games.GetNotes(d.DatabaseID, len(g.Players), noteSize); err != nil {
			hLog.Errorf(
				"Failed to get the notes from the database for game %v: %v",
				d.DatabaseID,
				err,
			)
			s.Error(InitGameFail)
			return false
		} else {
			notes = v
		}
	} else if d.Source == "json" {
		notes = d.GameJSON.Notes
	}

	// Ensure that the note arrays are the correct length
	for len(notes) < len(g.Players) {
		notes = append(notes, make([]string, 0))
	}
	for i := range notes {
		for len(notes[i]) < g.GetNotesSize() {
			notes[i] = append(notes[i], "")
		}
	}

	// Apply the notes
	for i, gp := range g.Players {
		gp.Notes = notes[i]
	}

	return true
}
