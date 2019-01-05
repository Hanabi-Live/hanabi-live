package main

import (
	"strconv"
	"time"

	"github.com/Zamiell/hanabi-live/src/models"
)

func commandSharedReplayCreate(s *Session, d *CommandData) {
	// Validate that there is not a shared replay for this game ID already
	gameID := d.ID
	if _, ok := games[gameID]; ok {
		s.Warning("There is already a shared replay for game #" + strconv.Itoa(gameID) + ".")
		return
	}

	if exists, err := db.Games.Exists(gameID); err != nil {
		log.Error("Failed to check to see if game "+strconv.Itoa(gameID)+" exists:", err)
		s.Error("Failed to initialize the game. Please contact an administrator.")
		return
	} else if !exists {
		s.Warning("Game #" + strconv.Itoa(gameID) + " does not exist in the database.")
		return
	}

	var variantID int
	if v, err := db.Games.GetVariant(gameID); err != nil {
		log.Error("Failed to get the variant from the database for game "+strconv.Itoa(gameID)+":", err)
		s.Error("Failed to initialize the game. Please contact an administrator.")
		return
	} else {
		variantID = v
	}

	var dbPlayers []*models.Player
	if v, err := db.Games.GetPlayers(gameID); err != nil {
		log.Error("Failed to get the players from the database for game "+strconv.Itoa(gameID)+":", err)
		s.Error("Failed to initialize the game. Please contact an administrator.")
		return
	} else {
		dbPlayers = v
	}
	var players []*Player
	for _, p := range dbPlayers {
		player := &Player{
			ID:   p.ID,
			Name: p.Name,
		}
		players = append(players, player)
	}

	var numTurns int
	if v, err := db.Games.GetNumTurns(gameID); err != nil {
		log.Error("Failed to get the number of turns from the database for game "+strconv.Itoa(gameID)+":", err)
		s.Error("Failed to initialize the game. Please contact an administrator.")
		return
	} else {
		numTurns = v
	}

	log.Info("User \"" + s.Username() + "\" created a new shared replay: #" + strconv.Itoa(gameID))

	// Define a standard naming scheme for shared replays
	name := "Shared replay for game #" + strconv.Itoa(gameID)

	// Keep track of the current games
	g := &Game{
		ID:    gameID,
		Name:  name,
		Owner: s.UserID(),
		Options: &Options{
			Variant: variantsID[variantID],
		},
		Players:            players,
		Spectators:         make([]*Session, 0),
		DisconSpectators:   make(map[int]bool),
		Running:            true,
		SharedReplay:       true,
		DatetimeCreated:    time.Now(),
		DatetimeLastAction: time.Now(),
		Turn:               0,
		EndTurn:            numTurns,
	}
	games[gameID] = g

	notifyAllTable(g)

	// Join the user to the new table
	// (in the "commandGameSpectate.go" file)
	joinSharedReplay(s, g)
}
