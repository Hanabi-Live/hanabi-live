package main

import (
	"strconv"
	"strings"
	"time"
)

const (
	// The maximum number of characters that a game name can be
	maxGameNameLength = 45
)

var (
	// Start at 1 and increment for every game created
	newGameID = 1
)

func commandGameCreate(s *Session, d *CommandData) {
	/*
		Validate
	*/

	// Validate that the server is not in shutdown mode
	if shutdownMode > 0 {
		s.Warning("The server is restarting soon (when all ongoing games have finished). You cannot start any new games for the time being.")
		return
	}

	// Make a default game name if they did not provide one
	if len(d.Name) == 0 {
		d.Name = s.Username() + "'s game"
	}

	// Validate that the game name is not excessively long
	if len(d.Name) > maxGameNameLength {
		s.Warning("You cannot have a game name be longer than " + strconv.Itoa(maxGameNameLength) + " characters.")
		return
	}

	// Validate that the game name does not contain any special characters
	// (this mitigates XSS-style attacks)
	if !isAlphanumericSpacesAndSafeSpecialCharacters(d.Name) {
		s.Warning("Game names can only contain English letters, numbers, and spaces.")
		return
	}

	// Validate that the player is not joined to another game
	if s.CurrentGame() != -1 {
		s.Warning("You cannot create a new game when you are already in one.")
		return
	}

	// Validate that the time controls are sane
	if d.Timed && d.BaseTimeMinutes <= 0 {
		s.Warning("That is not a valid value for \"Base Time\".")
		return
	}
	if d.Timed && d.TimePerTurnSeconds <= 0 {
		s.Warning("That is not a valid value for \"Time per Turn\".")
		return
	}

	// Blank out the time controls if this is not a timed game
	if !d.Timed {
		d.BaseTimeMinutes = 0
		d.TimePerTurnSeconds = 0
	}

	/*
		Create
	*/

	// Get the new game ID
	gameID := newGameID
	newGameID++

	// Create the game object
	g := &Game{
		ID:       gameID,
		Name:     d.Name,
		Owner:    s.UserID(),
		Password: d.Password,
		Options: &Options{
			Variant:              d.Variant,
			Timed:                d.Timed,
			TimeBase:             d.BaseTimeMinutes,
			TimePerTurn:          d.TimePerTurnSeconds,
			ReorderCards:         d.ReorderCards,
			DeckPlays:            d.DeckPlays,
			EmptyClues:           d.EmptyClues,
			CharacterAssignments: d.CharacterAssignments,
		},
		Players:            make([]*Player, 0),
		Spectators:         make([]*Session, 0),
		DisconSpectators:   make(map[int]bool),
		Clues:              8,
		DatetimeCreated:    time.Now(),
		DatetimeLastAction: time.Now(),
		Deck:               make([]*Card, 0),
		Stacks:             make([]int, 0),
		Actions:            make([]Action, 0),
		EndPlayer:          -1,
		EndTurn:            -1,
		Chat:               make([]*GameChatMessage, 0),
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

	// Alert the people on the waiting list, if any
	if g.Password == "" && !strings.HasPrefix(g.Name, "test") {
		// We don't want to alert on password-protected games or test games
		waitingListAlert(g, s.Username())
	}
}
