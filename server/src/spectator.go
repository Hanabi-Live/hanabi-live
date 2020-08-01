package main

import (
	"time"
)

type Spectator struct {
	ID   int // This is equal to the database ID for the user
	Name string
	// The user session corresponding to the spectator is copied here for convenience
	// The session should always be valid because when a user disconnects,
	// they will automatically stop spectating all games
	Session   *Session
	Typing    bool
	LastTyped time.Time

	// Spectators have the ability to watch a game from a specific player's perspective
	ShadowingPlayerIndex int // Equal to -1 if they are not shadowing a specific player

	Notes []string
}
