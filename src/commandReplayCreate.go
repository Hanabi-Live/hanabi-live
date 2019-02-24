/*
	Sent when the user clicks on the "Watch Replay", "Share Replay",
	or "Watch Specific Replay" button
	(the client will send a "hello" message after getting "gameStart")

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
)

func commandReplayCreate(s *Session, d *CommandData) {
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
	// Check to see if the game exists in the database
	if exists, err := db.Games.Exists(d.ID); err != nil {
		log.Error("Failed to check to see if game "+strconv.Itoa(d.ID)+" exists:", err)
		s.Error("Failed to initialize the game. Please contact an administrator.")
		return
	} else if !exists {
		s.Warning("Game #" + strconv.Itoa(d.ID) + " does not exist in the database.")
		return
	}

	if d.Visibility == "shared" {
		// Validate that there is not a shared replay for this game ID already
		if _, ok := games[d.ID]; ok {
			s.Warning("There is already a shared replay for game #" + strconv.Itoa(d.ID) + ".")
			return
		}
	}

	// Convert the game data from the database into a normal game object
	g, success := convertDatabaseGametoGame(s, d)
	if !success {
		return
	}
	games[d.ID] = g
	log.Info("User \"" + s.Username() + "\" created a new " + d.Visibility + " replay: #" + strconv.Itoa(d.ID))
	if g.Visible {
		notifyAllTable(g)
	}

	// Join the user to the new replay
	commandGameSpectate(s, d)
}

func convertDatabaseGametoGame(s *Session, d *CommandData) (*Game, bool) {
	// Define a standard naming scheme for shared replays
	name := strings.Title(d.Visibility) + " replay for game #" + strconv.Itoa(d.ID)

	// Figure out whether this game should be invisible
	visible := false
	if d.Visibility == "shared" {
		visible = true
	}

	// Get the options from the database
	var options models.Options
	if v, err := db.Games.GetOptions(d.ID); err != nil {
		log.Error("Failed to get the options from the database for game "+strconv.Itoa(d.ID)+":", err)
		s.Error("Failed to initialize the game. Please contact an administrator.")
		return nil, false
	} else {
		options = v
	}

	// Get the players from the database
	var dbPlayers []*models.Player
	if v, err := db.Games.GetPlayers(d.ID); err != nil {
		log.Error("Failed to get the players from the database for game "+strconv.Itoa(d.ID)+":", err)
		s.Error("Failed to initialize the game. Please contact an administrator.")
		return nil, false
	} else {
		dbPlayers = v
	}

	// Get the notes from the database
	var notes []models.PlayerNote
	if v, err := db.Games.GetNotes(d.ID); err != nil {
		log.Error("Failed to get the notes from the database "+
			"for game "+strconv.Itoa(d.ID)+":", err)
		s.Error("Failed to initialize the game. Please contact an administrator.")
		return nil, false
	} else {
		notes = v
	}

	// Convert the database player objects to normal player objects
	players := make([]*Player, 0)
	for i, p := range dbPlayers {
		player := &Player{
			ID:                p.ID,
			Name:              p.Name,
			Notes:             notes[i].Notes,
			Character:         charactersID[p.CharacterAssignment],
			CharacterMetadata: p.CharacterMetadata,
		}
		players = append(players, player)
	}

	// Get the actions from the database
	var actionStrings []string
	if v, err := db.GameActions.GetAll(d.ID); err != nil {
		log.Error("Failed to get the actions from the database "+
			"for game "+strconv.Itoa(d.ID)+":", err)
		s.Error("Failed to initialize the game. Please contact an administrator.")
		return nil, false
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
			return nil, false
		}
		actions = append(actions, action)
	}

	// Get the number of turns from the database
	var numTurns int
	if v, err := db.Games.GetNumTurns(d.ID); err != nil {
		log.Error("Failed to get the number of turns from the database for game "+strconv.Itoa(d.ID)+":", err)
		s.Error("Failed to initialize the game. Please contact an administrator.")
		return nil, false
	} else {
		numTurns = v
	}

	// If this is a solo replay, we need a brand new game ID
	if d.Visibility == "solo" {
		d.ID = newGameID
		newGameID++
	}

	// Create the game object
	g := &Game{
		ID:      d.ID,
		Name:    name,
		Owner:   s.UserID(),
		Visible: visible,
		Options: &Options{
			Variant:              variantsID[options.Variant],
			Timed:                options.Timed,
			BaseTime:             options.BaseTime,
			TimePerTurn:          options.TimePerTurn,
			Speedrun:             options.Speedrun,
			DeckPlays:            options.DeckPlays,
			EmptyClues:           options.EmptyClues,
			CharacterAssignments: options.CharacterAssignments,
		},
		Players:            players,
		Spectators:         make([]*Spectator, 0),
		DisconSpectators:   make(map[int]bool),
		Running:            true,
		Replay:             true,
		DatetimeCreated:    time.Now(),
		DatetimeLastAction: time.Now(),
		Actions:            actions,
		EndTurn:            numTurns,
	}

	return g, true
}

type gameJSON struct {
	Actions []actionJSON `json:"actions"`
	Deck    []CardSimple `json:"deck"`
	Notes   [][]string   `json:"notes"`
	Players []string     `json:"players"`
	Variant string       `json:"variant"`
}
type actionJSON struct {
	Clue   Clue   `json:"clue"`
	Target int    `json:"target"`
	Type   string `json:"type"`
}

func replayJSON(s *Session, d *CommandData) {
	// Validate that there is at least one action
	if len(d.GameJSON.Actions) < 1 {
		s.Warning("There must be at least one game action in the JSON array.")
		return
	}

	// Validate actions
	for i, action := range d.GameJSON.Actions {
		if action.Type == "clue" {
			if action.Target < 0 || action.Target > len(d.GameJSON.Players)-1 {
				s.Warning("Action " + strconv.Itoa(i) + " is a clue with an invalid target: " + strconv.Itoa(action.Target))
				return
			}
			if action.Clue.Type < 0 || action.Clue.Type > 1 {
				s.Warning("Action " + strconv.Itoa(i) + " is a clue with an clue type: " + strconv.Itoa(action.Clue.Type))
				return
			}
		} else if action.Type == "play" || action.Type == "discard" {
			if action.Target < 0 || action.Target > len(d.GameJSON.Deck)-1 {
				s.Warning("Action " + strconv.Itoa(i) + " is a " + action.Type + " with an invalid target.")
				return
			}
		} else {
			s.Warning("Action " + strconv.Itoa(i) + " has an invalid type: " + action.Type)
			return
		}
	}

	// Validate the variant
	var variant Variant
	if v, ok := variants[d.GameJSON.Variant]; !ok {
		s.Warning("That is not a valid variant.")
		return
	} else {
		variant = v
	}

	// Validate that the deck contains the right amount of cards
	totalCards := 0
	for _, suit := range variant.Suits {
		if suit.IsOneOfEach {
			totalCards += 5
		} else {
			totalCards += 10
		}
	}
	if len(d.GameJSON.Deck) != totalCards {
		s.Warning("The deck must have " + strconv.Itoa(totalCards) + " cards in it.")
		return
	}

	// Validate the notes
	if len(d.GameJSON.Notes) < 1 || len(d.GameJSON.Notes) > 6 {
		s.Warning("The number of note arrays must be between 1 and 6.")
		return
	}

	// Validate the amount of players
	if len(d.GameJSON.Players) < 1 || len(d.GameJSON.Players) > 6 {
		s.Warning("The number of players must be between 1 and 6.")
		return
	}

	// Get a new game ID
	d.ID = newGameID
	newGameID++

	// Convert the JSON game to a normal game object
	g := convertJSONGametoGame(s, d)
	games[g.ID] = g
	log.Info("User \"" + s.Username() + "\" created a new " + d.Visibility + " JSON replay: #" + strconv.Itoa(g.ID))
	notifyAllTable(g)

	// Join the user to the new shared replay
	commandGameSpectate(s, d)
}

func convertJSONGametoGame(s *Session, d *CommandData) *Game {
	// Local variables
	gameID := d.ID

	// Define a standard naming scheme for shared replays
	name := strings.Title(d.Visibility) + " replay for JSON game #" + strconv.Itoa(gameID)

	// Figure out whether this game should be invisible
	visible := false
	if d.Visibility == "shared" {
		visible = true
	}

	// Convert the JSON player objects to a normal player objects
	players := make([]*Player, 0)
	for i, name := range d.GameJSON.Players {
		player := &Player{
			ID:    i,
			Name:  name,
			Notes: d.GameJSON.Notes[i],
		}
		players = append(players, player)
	}

	// Convert the JSON actions to normal action objects
	actions := make([]interface{}, 0)
	for _, action := range d.GameJSON.Actions {
		if action.Type == "clue" {

		} else if action.Type == "play" {

		} else if action.Type == "discard" {

		}
	}

	// Create the game object
	g := &Game{
		ID:      gameID,
		Name:    name,
		Owner:   s.UserID(),
		Visible: visible,
		Options: &Options{
			Variant: d.GameJSON.Variant,
		},
		Players:            players,
		Spectators:         make([]*Spectator, 0),
		DisconSpectators:   make(map[int]bool),
		Running:            true,
		DatetimeCreated:    time.Now(),
		DatetimeLastAction: time.Now(),
		Actions:            actions,
		EndTurn:            len(d.GameJSON.Actions),
	}

	return g
}
