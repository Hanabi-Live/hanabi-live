/*
	Sent when the user clicks on the "Watch Replay", "Share Replay",
	or "Watch Specific Replay" button
	(the client will send a "hello" message after getting "tableStart")

	"data" example:
	{
		source: 'id',
		gameID: 15103, // Only if source is "id"
		json: '{"actions"=[],"deck"=[]}', // Only if source is "json"
		visibility: 'solo',
	}
*/

package main

import (
	"strconv"
	"strings"

	melody "gopkg.in/olahol/melody.v1"
)

type GameJSON struct {
	ID      int           `json:"id"` // Optional element only used for game exports
	Players []string      `json:"players"`
	Deck    []SimpleCard  `json:"deck"`
	Actions []*GameAction `json:"actions"`
	// Options is an optional element
	// Thus, it must be a pointer so that we can tell if the value was specified or not
	Options *OptionsJSON `json:"options,omitempty"`
	// Notes is an optional element
	Notes [][]string `json:"notes,omitempty"`
}

// The user wants to view the replay of a game from the database
// (or is submitting arbitrary actions from a hypothetical game)
// In order to derive the JSON actions to send to the client,
// we need to play through a mock game using these actions
func commandReplayCreate(s *Session, d *CommandData) {
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

	if d.Source == "json" {
		// Before creating a new game and emulating the actinos,
		// we want to ensure that the submitted JSON does not have any obvious errors
		if !validateJSON(s, d) {
			return
		}
	}

	// Create a table
	name := strings.Title(d.Visibility) + " replay for "
	if d.Source == "id" {
		name += "game #" + strconv.Itoa(d.GameID)
	} else if d.Source == "json" {
		name += s.Username() + "'"
		if !strings.HasSuffix(s.Username(), "s") {
			name += "s"
		}
		name += " JSON game"
	}

	t := NewTable(name, -1)
	t.Visible = d.Visibility == "shared"
	tables[t.ID] = t
	if d.Source == "id" {
		logger.Info("User \"" + s.Username() + "\" created a new " + d.Visibility +
			" replay for game #" + strconv.Itoa(d.GameID))
	} else if d.Source == "json" {
		logger.Info("User \"" + s.Username() + "\" created a new " + d.Visibility + " JSON replay")
	}
	// (a "table" message will be sent in the "commandTableSpectate" function below)

	// Load the players and options from the database or JSON file
	if d.Source == "id" {
		if !loadDatabaseToTable(s, d, t) {
			return
		}
	} else if d.Source == "json" {
		loadJSONToTable(s, d, t)
	}

	// Start the (fake) game
	commandTableStart(t.Players[0].Session, nil)
	g := t.Game
	if d.Source == "id" {
		g.ID = d.GameID
	}

	if !applyNotesToPlayers(s, d, g) {
		return
	}

	emulateActions(s, d, t)

	// If the game was terminated or did not finish, then the deck order will not be appended yet
	// (which is normally done in the "Game.End()" function)
	if g.EndCondition == endConditionInProgress {
		g.End() // This will only append the deck order and then return early
	}

	// Do a mini-version of the rest of steps in the "g.End()" function
	t.Replay = true
	g.EndTurn = g.Turn
	g.Turn = 0 // We want to start viewing the replay at the beginning, not the end
	t.Progress = 0

	// Join the user to the new replay
	d.TableID = t.ID
	commandTableSpectate(s, d)
	t.Owner = s.UserID()

	// Start the idle timeout
	go t.CheckIdle()
}

func validateJSON(s *Session, d *CommandData) bool {
	// All options are optinal; specify defaults if they were not specified
	if d.GameJSON.Options == nil {
		d.GameJSON.Options = &OptionsJSON{}
	}
	if d.GameJSON.Options.Variant == nil {
		variantText := "No Variant"
		d.GameJSON.Options.Variant = &variantText
	}

	// Validate that the specified variant exists
	var variant *Variant
	if v, ok := variants[*d.GameJSON.Options.Variant]; !ok {
		s.Warning("That is not a valid variant.")
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
		if action.Type == actionType2Play || action.Type == actionType2Discard {
			if action.Target < 0 || action.Target > len(d.GameJSON.Deck)-1 {
				s.Warning("Action at index " + strconv.Itoa(i) +
					" is a play or discard with an invalid target (card order) of " +
					strconv.Itoa(action.Target) + ".")
				return false
			}
			if action.Value != 0 {
				s.Warning("Action at index " + strconv.Itoa(i) +
					" is a play or discard with a value of " + strconv.Itoa(action.Value) +
					", which is nonsensical.")
				return false
			}
		} else if action.Type == actionType2ColorClue || action.Type == actionType2RankClue {
			if action.Target < 0 || action.Target > len(d.GameJSON.Players)-1 {
				s.Warning("Action at index " + strconv.Itoa(i) +
					" is a clue with an invalid target (player index) of " +
					strconv.Itoa(action.Target) + ".")
				return false
			}
			if action.Type == actionType2ColorClue {
				if action.Value < 0 || action.Value > len(variant.ClueColors) {
					s.Warning("Action at index " + strconv.Itoa(i) +
						" is a color clue with an invalid value of " +
						strconv.Itoa(action.Value) + ".")
					return false
				}
			} else if action.Type == actionType2RankClue {
				if action.Value < 1 || action.Value > 5 {
					s.Warning("Action at index " + strconv.Itoa(i) +
						" is a rank clue with an invalid value of " +
						strconv.Itoa(action.Value) + ".")
					return false
				}
			}
		} else if action.Type == actionType2GameOver {
			if action.Target < 0 || action.Target > len(d.GameJSON.Players)-1 {
				s.Warning("Action at index " + strconv.Itoa(i) +
					" is a game over with an invalid target (player index) of " +
					strconv.Itoa(action.Target) + ".")
				return false
			}
			if action.Value > 0 {
				s.Warning("Action at index " + strconv.Itoa(i) +
					" is a game over with a value of " + strconv.Itoa(action.Value) +
					", which is nonsensical.")
				return false
			}
		} else {
			s.Warning("Action at index " + strconv.Itoa(i) + " has an invalid type of " +
				strconv.Itoa(action.Type) + ".")
			return false
		}
	}

	// Validate the deck
	deckSize := variant.GetDeckSize()
	if len(d.GameJSON.Deck) != deckSize {
		s.Warning("The deck must have " + strconv.Itoa(deckSize) + " cards in it.")
		return false
	}
	for i, card := range d.GameJSON.Deck {
		if card.Suit < 0 || card.Suit > len(variant.Suits)-1 {
			s.Warning("The card at index " + strconv.Itoa(i) +
				" has an invalid suit number of " + strconv.Itoa(card.Suit) + ".")
			return false
		}
		if (card.Rank < 1 || card.Rank > 5) && card.Rank != startCardRank {
			s.Warning("The card at index " + strconv.Itoa(i) +
				" has an invalid rank number of " + strconv.Itoa(card.Rank) + ".")
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
				s.Warning("The note array at index " + strconv.Itoa(i) +
					" has too many notes; it must have at most " + strconv.Itoa(maxSize) + ".")
				return false
			}

			// If a note array is empty or does not have enough notes, fill them up with blank notes
			for len(playerNotes) < maxSize {
				playerNotes = append(playerNotes, "")
			}
		}
	}

	return true
}

func loadDatabaseToTable(s *Session, d *CommandData, t *Table) bool {
	// Check to see if the game exists in the database
	if exists, err := models.Games.Exists(d.GameID); err != nil {
		logger.Error("Failed to check to see if game "+strconv.Itoa(d.GameID)+" exists:", err)
		s.Error(initFail)
		return false
	} else if !exists {
		s.Warning("Game #" + strconv.Itoa(d.GameID) + " does not exist in the database.")
		return false
	}

	// Get the options from the database
	var options DBOptions
	if v, err := models.Games.GetOptions(d.GameID); err != nil {
		logger.Error("Failed to get the options from the database for game "+
			strconv.Itoa(d.GameID)+":", err)
		s.Error(initFail)
		return false
	} else {
		options = v
	}

	// Validate that the variant exists
	var variant string
	if v, ok := variantsID[options.Variant]; !ok {
		logger.Error("Failed to find a definition for variant " +
			strconv.Itoa(options.Variant) + ".")
		s.Error(initFail)
		return false
	} else {
		variant = v
	}

	// Get the seed
	var seed string
	if v, err := models.Games.GetSeed(d.GameID); err != nil {
		logger.Error("Failed to get the seed for game "+
			"\""+strconv.Itoa(d.GameID)+"\":", err)
		s.Error("Failed to create the game. Please contact an administrator.")
		return false
	} else {
		seed = v
	}

	// Store the options on the table
	t.Options = &Options{
		StartingPlayer:       options.StartingPlayer, // Legacy field for games prior to April 2020
		Variant:              variant,
		Timed:                options.Timed,
		BaseTime:             options.BaseTime,
		TimePerTurn:          options.TimePerTurn,
		Speedrun:             options.Speedrun,
		CardCycle:            options.CardCycle,
		DeckPlays:            options.DeckPlays,
		EmptyClues:           options.EmptyClues,
		CharacterAssignments: options.CharacterAssignments,

		Replay:  true, // We need to mark that the game should not be written to the database
		SetSeed: seed,
	}

	// Get the players from the database
	var playerNames []string
	if v, err := models.Games.GetPlayerNames(d.GameID); err != nil {
		logger.Error("Failed to get the player names from the database for game "+
			strconv.Itoa(d.GameID)+":", err)
		s.Error(initFail)
		return false
	} else {
		playerNames = v
	}

	// Convert the database player objects to Player objects
	loadFakePlayers(t, playerNames)

	return true
}

func loadJSONToTable(s *Session, d *CommandData, t *Table) {
	// In order to avoid "runtime error: invalid memory address or nil pointer dereference",
	// we must explicitly check to see if all pointers exist
	timed := false
	if d.GameJSON.Options.Timed != nil {
		timed = *d.GameJSON.Options.Timed
	}
	baseTime := 0
	if d.GameJSON.Options.Timed != nil {
		baseTime = *d.GameJSON.Options.BaseTime
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
	characterAssignments := false
	if d.GameJSON.Options.CharacterAssignments != nil {
		characterAssignments = *d.GameJSON.Options.CharacterAssignments
	}

	// Store the options on the table
	// (the variant was already validated in the "validateJSON()" function)
	t.Options = &Options{
		Variant:              *d.GameJSON.Options.Variant,
		Timed:                timed,
		BaseTime:             baseTime,
		TimePerTurn:          timePerTurn,
		Speedrun:             speedrun,
		CardCycle:            cardCycle,
		DeckPlays:            deckPlays,
		EmptyClues:           emptyClues,
		CharacterAssignments: characterAssignments,

		Replay:     true, // We need to mark that the game should not be written to the database
		CustomDeck: d.GameJSON.Deck,
	}

	loadFakePlayers(t, d.GameJSON.Players)
}

func loadFakePlayers(t *Table, playerNames []string) {
	// Convert the JSON player objects to Player objects
	for i, name := range playerNames {
		// The session ID and the user ID can be any arbitrary unique number,
		// but we set them to -1, -2, etc., so that they will not overlap with any valid user IDs
		id := (i + 1) * -1

		player := &Player{
			ID:      id,
			Name:    name,
			Session: newFakeSession(id, name, t.ID),
			Present: true,
		}
		t.Players = append(t.Players, player)
	}
}

func newFakeSession(id int, name string, currentTable int) *Session {
	// Prepare a "fake" player session that will be used for emulation
	keys := make(map[string]interface{})

	keys["sessionID"] = id
	keys["userID"] = id
	keys["username"] = name
	keys["admin"] = false
	keys["firstTimeUser"] = false
	keys["currentTable"] = currentTable
	keys["status"] = statusPlaying

	return &Session{
		&melody.Session{
			Keys: keys,
		},
	}
}

func applyNotesToPlayers(s *Session, d *CommandData, g *Game) bool {
	var notes [][]string
	if d.Source == "id" {
		// Get the notes from the database
		variant := variants[g.Options.Variant]
		noteSize := variant.GetDeckSize() + len(variant.Suits)
		if v, err := models.Games.GetNotes(d.GameID, len(g.Players), noteSize); err != nil {
			logger.Error("Failed to get the notes from the database "+
				"for game "+strconv.Itoa(d.GameID)+":", err)
			s.Error(initFail)
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
		for len(notes[i]) < len(g.Deck)+len(variants[g.Options.Variant].Suits) {
			notes[i] = append(notes[i], "")
		}
	}

	// Apply the notes
	for i, gp := range g.Players {
		gp.Notes = notes[i]
	}

	return true
}

func emulateActions(s *Session, d *CommandData, t *Table) bool {
	// Local variables
	g := t.Game

	var actions []*GameAction
	if d.Source == "id" {
		// Get the actions from the database
		if v, err := models.GameActions.GetAll(d.GameID); err != nil {
			logger.Error("Failed to get the actions from the database "+
				"for game "+strconv.Itoa(d.GameID)+":", err)
			s.Error(initFail)
			return false
		} else {
			actions = v
		}
	} else if d.Source == "json" {
		actions = d.GameJSON.Actions
	}

	// Make the appropriate moves in the game to match what is listed in the database
	for i, action := range actions {
		if t.Options.SetReplay != 0 && t.Options.SetReplayTurn == i {
			// This is a "!replay" game and we have reached the intended turn
			break
		}

		p := t.Players[g.ActivePlayer]

		if action.Type == actionType2Play {
			commandAction(p.Session, &CommandData{
				Type:   actionTypePlay,
				Target: action.Target,
			})
		} else if action.Type == actionType2Discard {
			commandAction(p.Session, &CommandData{
				Type:   actionTypeDiscard,
				Target: action.Target,
			})
		} else if action.Type == actionType2ColorClue {
			commandAction(p.Session, &CommandData{
				Type:   actionTypeClue,
				Target: action.Target,
				Clue: Clue{
					Type:  clueTypeColor,
					Value: action.Value,
				},
			})
		} else if action.Type == actionType2RankClue {
			commandAction(p.Session, &CommandData{
				Type:   actionTypeClue,
				Target: action.Target,
				Clue: Clue{
					Type:  clueTypeRank,
					Value: action.Value,
				},
			})
		} else if action.Type == actionType2GameOver {
			ps := t.Players[action.Target].Session
			if action.Value == endConditionTimeout {
				commandAction(ps, &CommandData{
					Type: actionTypeTimeLimitReached,
				})
			} else if action.Value == endConditionTerminated {
				commandTableTerminate(ps, nil)
			} else if action.Value == endConditionIdleTimeout {
				commandAction(ps, &CommandData{
					Type: actionTypeIdleLimitReached,
				})
			}
		} else {
			logger.Error("Failed to interpret a game action with a type of " +
				strconv.Itoa(action.Type) + ".")
			s.Error(initFail)
			return false
		}

		if g.InvalidActionOccurred {
			logger.Info("An invalid action occurred; not emulating the rest of the actions.")
			s.Warning("The action at index " + strconv.Itoa(i) +
				" was not valid. Skipping all subsequent actions.")
			return true
		}
	}

	return true
}
