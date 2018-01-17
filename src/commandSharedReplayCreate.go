package main

import (
	"strconv"
)

func commandSharedReplayCreate(s *Session, d *CommandData) {
	// Validate that there is not a shared replay for this game ID already
	gameID := d.ID
	if _, ok := games[gameID]; ok {
		s.Error("There is already a shared replay for game #" + strconv.Itoa(gameID) + ".")
		return
	}

	if exists, err := db.Games.Exists(gameID); err != nil {
		log.Error("Failed to check to see if game "+strconv.Itoa(gameID)+" exists:", err)
		s.Error("Failed to initialize the game. Please contact an administrator.")
		return
	} else if !exists {
		s.Error("Game #" + strconv.Itoa(gameID) + " does not exist.")
		return
	}

	var variant int
	if v, err := db.Games.GetVariant(gameID); err != nil {
		log.Error("Failed to get the variant from the database for game "+strconv.Itoa(gameID)+":", err)
		s.Error("Failed to initialize the game. Please contact an administrator.")
		return
	} else {
		variant = v
	}

	log.Info("User \"" + s.Username() + "\" created a new shared replay: #" + strconv.Itoa(gameID))

	// Define a standard naming scheme for shared replays
	name := "Shared replay for game #" + strconv.Itoa(gameID)

	// Keep track of the current games
	g := &Game{
		ID:   gameID,
		Name: name,
		Options: &Options{
			Variant: variant,
		},
		Spectators:       make(map[int]*Session),
		DisconSpectators: make(map[int]bool),
		Running:          true,
		SharedReplay:     true,
		Owner:            s.UserID(),
	}
	games[gameID] = g

	notifyAllTable(g)

	// Join the user to the new table
	// (in the "commandGameSpectate.go" file)
	joinSharedReplay(s, d, g)
}
