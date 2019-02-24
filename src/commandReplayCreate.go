/*
	Sent when the user clicks on the "Watch Replay", "Share Replay",
	or "Watch Specific Replay" button
	(the client will send a "hello" message after getting "gameStart")

	"data" example:
	{
		source: 'id',
		gameID: 15103, // Only if source is "id"
		json: '[{"data1"},{"data2"}], // Only if source is "json"
		visibility: 'solo',
	}
*/

package main

import (
	"strconv"
	"time"

	"github.com/Zamiell/hanabi-live/src/models"
)

func commandReplayCreate(s *Session, d *CommandData) {
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
	gameID := d.ID
	if exists, err := db.Games.Exists(gameID); err != nil {
		log.Error("Failed to check to see if game "+strconv.Itoa(gameID)+" exists:", err)
		s.Error("Failed to initialize the game. Please contact an administrator.")
		return
	} else if !exists {
		s.Warning("Game #" + strconv.Itoa(gameID) + " does not exist in the database.")
		return
	}

	// Validate the visibility
	if d.Visibility == "solo" {
		replayIDSolo(s, d)
	} else if d.Visibility == "shared" {
		replayIDShared(s, d)
	} else {
		s.Warning("That is not a valid replay visibility.")
	}
}

func replayIDSolo(s *Session, d *CommandData) {
	// Set their status
	s.Set("currentGame", d.ID)
	s.Set("status", statusReplay)
	notifyAllUser(s)

	// Send them a "gameStart" message
	s.NotifyGameStart()
}

func replayIDShared(s *Session, d *CommandData) {
	// Validate that there is not a shared replay for this game ID already
	gameID := d.ID
	if _, ok := games[gameID]; ok {
		s.Warning("There is already a shared replay for game #" + strconv.Itoa(gameID) + ".")
		return
	}

	g, success := convertDatabaseGametoGame(s, d)
	if !success {
		return
	}
	games[gameID] = g

	notifyAllTable(g)

	// Join the user to the new shared replay
	d.ID = gameID
	commandGameSpectate(s, d)
}

func convertDatabaseGametoGame(s *Session, d *CommandData) (*Game, bool) {
	// Local variables
	gameID := d.ID

	// Get the options from the database
	var options models.Options
	if v, err := db.Games.GetOptions(gameID); err != nil {
		log.Error("Failed to get the options from the database for game "+strconv.Itoa(gameID)+":", err)
		s.Error("Failed to initialize the game. Please contact an administrator.")
		return nil, false
	} else {
		options = v
	}

	// Get the players from the database
	var dbPlayers []*models.Player
	if v, err := db.Games.GetPlayers(gameID); err != nil {
		log.Error("Failed to get the players from the database for game "+strconv.Itoa(gameID)+":", err)
		s.Error("Failed to initialize the game. Please contact an administrator.")
		return nil, false
	} else {
		dbPlayers = v
	}

	// We need to convert the database player objects to a normal player objects
	players := make([]*Player, 0)
	for _, p := range dbPlayers {
		player := &Player{
			ID:                p.ID,
			Name:              p.Name,
			Character:         charactersID[p.CharacterAssignment],
			CharacterMetadata: p.CharacterMetadata,
		}
		players = append(players, player)
	}

	// Get the number of turns from the database
	var numTurns int
	if v, err := db.Games.GetNumTurns(gameID); err != nil {
		log.Error("Failed to get the number of turns from the database for game "+strconv.Itoa(gameID)+":", err)
		s.Error("Failed to initialize the game. Please contact an administrator.")
		return nil, false
	} else {
		numTurns = v
	}

	log.Info("User \"" + s.Username() + "\" created a new shared replay: #" + strconv.Itoa(gameID))

	// Define a standard naming scheme for shared replays
	name := "Shared replay for game #" + strconv.Itoa(gameID)

	// Create the game object
	g := &Game{
		ID:    gameID,
		Name:  name,
		Owner: s.UserID(),
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
		SharedReplay:       true,
		DatetimeCreated:    time.Now(),
		DatetimeLastAction: time.Now(),
		Turn:               0,
		EndTurn:            numTurns,
	}

	return g, true
}

func replayJSON(s *Session, d *CommandData) {
	// Validate the visibility
	if d.Visibility == "solo" {
		replayJSONSolo(s, d)
	} else if d.Visibility == "shared" {
		replayJSONShared(s, d)
	} else {
		s.Warning("That is not a valid replay visibility.")
	}
}

func replayJSONSolo(s *Session, d *CommandData) {

}

func replayJSONShared(s *Session, d *CommandData) {

}
