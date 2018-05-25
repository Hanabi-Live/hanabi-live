package main

import (
	"strconv"
	"time"
)

const (
	maxGameLength = 45
)

var (
	// Start at 1 and increment for every game created
	newGameID = 1
)

func commandGameCreate(s *Session, d *CommandData) {
	/*
		Validate
	*/

	// Make a default game name if they did not provide one
	if len(d.Name) == 0 {
		d.Name = s.Username() + "'s game"
	}

	// Validate that the game name is not excessively long
	if len(d.Name) > maxGameLength {
		s.Error("You cannot have a game name be longer than " + strconv.Itoa(maxGameLength) + " characters.")
		return
	}

	// Validate that the player is not joined to another game
	if s.CurrentGame() != -1 {
		s.Error("You cannot create a new game when you are already in one.")
		return
	}

	/*
		Create
	*/

	// Get the new game ID
	gameID := newGameID
	newGameID++

	// Create the game object
	g := &Game{
		ID:    gameID,
		Name:  d.Name,
		Owner: s.UserID(),
		Options: &Options{
			Variant:      d.Variant,
			Timed:        d.Timed,
			TimeBase:     d.BaseTimeMinutes,
			TimePerTurn:  d.TimePerTurnSeconds,
			ReorderCards: d.ReorderCards,
		},
		Players:            make([]*Player, 0),
		Spectators:         make(map[int]*Session),
		DisconSpectators:   make(map[int]bool),
		Clues:              8,
		DatetimeCreated:    time.Now(),
		DatetimeLastAction: time.Now(),
		Deck:               make([]*Card, 0),
		Stacks:             make([]int, 0),
		Actions:            make([]Action, 0),
		DiscardSignal: &DiscardSignal{
			TurnExpiration: -1,
		},
	}
	msg := g.GetName() + "User \"" + s.Username() + "\" created"
	if g.Options.Timed && g.Options.ReorderCards {
		msg += " (timed / reorder)"
	} else if g.Options.Timed {
		msg += " (timed)"
	} else if g.Options.ReorderCards {
		msg += " (reorder)"
	}
	msg += "."
	log.Info(msg)

	// Add it to the map
	games[gameID] = g

	// Let everyone know about the new table
	notifyAllTable(g)

	// Join the user to the new table
	d.ID = gameID
	commandGameJoin(s, d)
}
