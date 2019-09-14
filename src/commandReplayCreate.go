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
	"encoding/json"
	"strconv"
	"strings"
	"time"

	"github.com/Zamiell/hanabi-live/src/models"
	melody "gopkg.in/olahol/melody.v1"
)

func commandReplayCreate(s *Session, d *CommandData) {
	// Validate that there are no inappropriate fields
	if d.Password != "" {
		s.Warning("You cannot create a replay with an invalid field.")
		return
	}

	// Validate the visibility
	if d.Visibility != "solo" && d.Visibility != "shared" {
		s.Warning("That is not a valid replay visibility.")
		return
	}

	// Validate the source
	if d.Source == "id" {
		replayID(s, d)
	} else if d.Source == "json" {
		replayJSON(s, d)
	} else {
		s.Warning("That is not a valid replay source.")
	}
}

func replayID(s *Session, d *CommandData) {
	// Create a table
	name := strings.Title(d.Visibility) + " replay for game #" + strconv.Itoa(d.GameID)
	t := NewTable(name, s.UserID())
	t.Visible = d.Visibility == "shared"
	t.Running = true
	t.Replay = true

	// Convert the game data from the database into a Game object
	if !convertDatabaseGametoGame(s, d, t) {
		return
	}

	tables[t.ID] = t
	log.Info("User \"" + s.Username() + "\" created a new " + d.Visibility + " replay: " +
		"#" + strconv.Itoa(d.GameID))
	// (a "table" message will be sent in the "commandTableSpectate" function below)

	// Join the user to the new replay
	d.TableID = t.ID
	commandTableSpectate(s, d)

	// Start the idle timeout
	go t.CheckIdle()
}

func convertDatabaseGametoGame(s *Session, d *CommandData, t *Table) bool {
	// Check to see if the game exists in the database
	if exists, err := db.Games.Exists(d.GameID); err != nil {
		log.Error("Failed to check to see if game "+strconv.Itoa(d.GameID)+" exists:", err)
		s.Error("Failed to initialize the game. Please contact an administrator.")
		return false
	} else if !exists {
		s.Warning("Game #" + strconv.Itoa(d.GameID) + " does not exist in the database.")
		return false
	}

	// Get the options from the database
	var options models.Options
	if v, err := db.Games.GetOptions(d.GameID); err != nil {
		log.Error("Failed to get the options from the database for game "+strconv.Itoa(d.GameID)+":", err)
		s.Error("Failed to initialize the game. Please contact an administrator.")
		return false
	} else {
		options = v
	}

	// Validate that the variant exists
	if _, ok := variantsID[options.Variant]; !ok {
		log.Error("Failed to find a definition for variant " + strconv.Itoa(options.Variant) + ".")
		s.Error("Failed to initialize the game. Please contact an administrator.")
		return false
	}

	// Store them on the table
	t.Options = &Options{
		Variant:              variantsID[options.Variant],
		Timed:                options.Timed,
		BaseTime:             options.BaseTime,
		TimePerTurn:          options.TimePerTurn,
		Speedrun:             options.Speedrun,
		DeckPlays:            options.DeckPlays,
		EmptyClues:           options.EmptyClues,
		CharacterAssignments: options.CharacterAssignments,
	}

	// Get the players from the database
	var dbPlayers []*models.Player
	if v, err := db.Games.GetPlayers(d.GameID); err != nil {
		log.Error("Failed to get the players from the database for game "+strconv.Itoa(d.GameID)+":", err)
		s.Error("Failed to initialize the game. Please contact an administrator.")
		return false
	} else {
		dbPlayers = v
	}

	// Get the notes from the database
	var notes []models.NoteList
	if v, err := db.Games.GetNotes(d.GameID); err != nil {
		log.Error("Failed to get the notes from the database "+
			"for game "+strconv.Itoa(d.GameID)+":", err)
		s.Error("Failed to initialize the game. Please contact an administrator.")
		return false
	} else {
		notes = v
	}

	// Convert the database player objects to Player objects
	for _, dbp := range dbPlayers {
		player := &Player{
			ID:   dbp.ID,
			Name: dbp.Name,
		}
		t.Players = append(t.Players, player)
	}

	// Convert the database player objects to GamePlayer objects
	gamePlayers := make([]*GamePlayer, 0)
	for i, dbp := range dbPlayers {
		gamePlayer := &GamePlayer{
			Name:  dbp.Name,
			Index: i,

			Hand:              make([]*Card, 0),
			Notes:             notes[i].Notes,
			Character:         charactersID[dbp.CharacterAssignment],
			CharacterMetadata: dbp.CharacterMetadata,
		}
		gamePlayers = append(gamePlayers, gamePlayer)
	}

	// Get the actions from the database
	var actionStrings []string
	if v, err := db.GameActions.GetAll(d.GameID); err != nil {
		log.Error("Failed to get the actions from the database "+
			"for game "+strconv.Itoa(d.GameID)+":", err)
		s.Error("Failed to initialize the game. Please contact an administrator.")
		return false
	} else {
		actionStrings = v
	}

	// Convert the database action objects to normal action objects
	actions := make([]interface{}, 0)
	for _, actionString := range actionStrings {
		// Convert it from JSON
		var action interface{}
		if err := json.Unmarshal([]byte(actionString), &action); err != nil {
			log.Error("Failed to unmarshal an action:", err)
			s.Error("Failed to initialize the game. Please contact an administrator.")
			return false
		}
		actions = append(actions, action)
	}

	// Get the number of turns from the database
	var numTurns int
	if v, err := db.Games.GetNumTurns(d.GameID); err != nil {
		log.Error("Failed to get the number of turns from the database for game "+strconv.Itoa(d.GameID)+":", err)
		s.Error("Failed to initialize the game. Please contact an administrator.")
		return false
	} else {
		numTurns = v
	}

	// Create the game object
	g := NewGame(t)
	g.ID = d.GameID
	g.Players = gamePlayers
	g.Actions = actions
	g.EndTurn = numTurns

	return true
}

type GameJSON struct {
	Actions     []ActionJSON `json:"actions"`
	Deck        []CardSimple `json:"deck"`
	FirstPlayer int          `json:"firstPlayer"`
	Notes       [][]string   `json:"notes"`
	Players     []string     `json:"players"`
	Variant     string       `json:"variant"`
}
type ActionJSON struct {
	Clue   Clue `json:"clue"`
	Target int  `json:"target"`
	Type   int  `json:"type"`
}

func replayJSON(s *Session, d *CommandData) {
	// Validate that there is at least one action
	if len(d.GameJSON.Actions) < 1 {
		s.Warning("There must be at least one game action in the JSON array.")
		return
	}

	// Validate actions
	for i, action := range d.GameJSON.Actions {
		if action.Type == actionTypeClue {
			if action.Target < 0 || action.Target > len(d.GameJSON.Players)-1 {
				s.Warning("Action " + strconv.Itoa(i) + " is a clue with an invalid target: " + strconv.Itoa(action.Target))
				return
			}
			if action.Clue.Type < 0 || action.Clue.Type > 1 {
				s.Warning("Action " + strconv.Itoa(i) + " is a clue with an clue type: " + strconv.Itoa(action.Clue.Type))
				return
			}
		} else if action.Type == actionTypePlay || action.Type == actionTypeDiscard {
			if action.Target < 0 || action.Target > len(d.GameJSON.Deck)-1 {
				s.Warning("Action " + strconv.Itoa(i) + " is a play or discard with an invalid target.")
				return
			}
		} else {
			s.Warning("Action " + strconv.Itoa(i) + " has an invalid type: " + strconv.Itoa(action.Type))
			return
		}
	}

	// Validate the variant
	var variant *Variant
	if v, ok := variants[d.GameJSON.Variant]; !ok {
		s.Warning("That is not a valid variant.")
		return
	} else {
		variant = v
	}

	// Validate that the deck contains the right amount of cards
	totalCards := 0
	for _, suit := range variant.Suits {
		if suit.OneOfEach {
			totalCards += 5
		} else {
			totalCards += 10
		}
	}
	if strings.HasPrefix(variant.Name, "Up or Down") {
		totalCards -= len(variant.Suits)
	}
	if len(d.GameJSON.Deck) != totalCards {
		s.Warning("The deck must have " + strconv.Itoa(totalCards) + " cards in it.")
		return
	}

	// Validate the amount of players
	if len(d.GameJSON.Players) < 2 || len(d.GameJSON.Players) > 6 {
		s.Warning("The number of players must be between 2 and 6.")
		return
	}

	// Validate the notes
	if len(d.GameJSON.Notes) == 0 {
		// They did not provide any notes, so create a blank note array
		d.GameJSON.Notes = make([][]string, len(d.GameJSON.Players))
		for i := 0; i < len(d.GameJSON.Players); i++ {
			d.GameJSON.Notes[i] = make([]string, totalCards)
		}
	} else if len(d.GameJSON.Notes) != len(d.GameJSON.Players) {
		s.Warning("The number of note arrays must match the number of players.")
		return
	}

	// Create a table
	name := strings.Title(d.Visibility) + " replay for " + s.Username() + "'s JSON game"
	t := NewTable(name, s.UserID())
	t.Visible = d.Visibility == "shared"
	t.Running = true

	// Convert the JSON game to a Game object
	convertJSONGametoGame(s, d, t)
	g := t.Game

	tables[t.ID] = t
	log.Info("User \"" + s.Username() + "\" created a new " + d.Visibility + " JSON replay")
	// (a "table" message will be sent in the "commandTableSpectate" function below)

	// Send messages from fake players to emulate the gameplay that occurred in the JSON actions
	emulateJSONActions(t, d)

	// Do a mini-version of the steps in the "g.End()" function
	t.Replay = true
	g.EndTurn = g.Turn
	g.Turn = 0 // We want to start viewing the replay at the beginning, not the end
	t.Progress = 0

	// Join the user to the new replay
	d.TableID = t.ID
	commandTableSpectate(s, d)

	// Start the idle timeout
	go t.CheckIdle()
}

func convertJSONGametoGame(s *Session, d *CommandData, t *Table) {
	// Store the options on the table
	t.Options = &Options{
		Variant:    d.GameJSON.Variant,
		EmptyClues: true, // Always enable empty clues in case it is used in the JSON

		JSONGame: true, // // We need to mark that the game should not be written to the database
	}

	// Convert the JSON player objects to Player objects
	for i, name := range d.GameJSON.Players {
		// Prepare the player session that will be used for emulation
		keys := make(map[string]interface{})
		keys["ID"] = -1 // We set it to -1 since it does not matter
		// This can be any arbitrary unique number,
		// but we will set it to the same value as the player index for simplicity
		keys["userID"] = i
		keys["username"] = name
		keys["admin"] = false
		keys["firstTimeUser"] = false
		keys["currentTable"] = t.ID
		keys["status"] = statusPlaying

		player := &Player{
			ID:   i,
			Name: name,
			Session: &Session{
				&melody.Session{
					Keys: keys,
				},
			},
			Present: true,
		}
		t.Players = append(t.Players, player)
	}

	// Convert the JSON player objects to GamePlayer objects
	gamePlayers := make([]*GamePlayer, 0)
	for i, name := range d.GameJSON.Players {
		gamePlayer := &GamePlayer{
			Name:  name,
			Index: i,

			Hand:  make([]*Card, 0),
			Time:  time.Duration(0),
			Notes: d.GameJSON.Notes[i],
		}
		gamePlayers = append(gamePlayers, gamePlayer)
	}

	// Create the game object
	g := NewGame(t)
	g.Players = gamePlayers
	g.ActivePlayer = d.GameJSON.FirstPlayer

	// Convert the JSON deck to a normal deck
	for i, c := range d.GameJSON.Deck {
		g.Deck = append(g.Deck, &Card{
			Suit:  c.Suit,
			Rank:  c.Rank,
			Order: i,
		})
	}

	/*
		The following code is mostly copied from the "commandTableStart()" function
	*/

	// Deal the cards
	handSize := g.GetHandSize()
	for _, p := range g.Players {
		for i := 0; i < handSize; i++ {
			p.DrawCard(g)
		}
	}

	// Record the initial status of the game
	t.NotifyStatus(false) // The argument is "doubleDiscard"

	// Show who goes first
	// (this must be sent before the "turn" message
	// so that the text appears on the first turn of the replay)
	text := g.Players[g.ActivePlayer].Name + " goes first"
	g.Actions = append(g.Actions, ActionText{
		Type: "text",
		Text: text,
	})
	log.Info(t.GetName() + text)

	// Record a message about the first turn
	t.NotifyTurn()
}

func emulateJSONActions(t *Table, d *CommandData) {
	g := t.Game

	// Emulate the JSON actions to normal action objects
	for _, action := range d.GameJSON.Actions {
		p := t.Players[g.ActivePlayer]
		if action.Type == actionTypeClue {
			commandAction(p.Session, &CommandData{
				Type:   actionTypeClue,
				Target: action.Target,
				Clue:   action.Clue,
			})
		} else if action.Type == actionTypePlay {
			commandAction(p.Session, &CommandData{
				Type:   actionTypePlay,
				Target: action.Target,
			})
		} else if action.Type == actionTypeDiscard {
			commandAction(p.Session, &CommandData{
				Type:   actionTypeDiscard,
				Target: action.Target,
			})
		}
	}
}
