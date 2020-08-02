package main

import (
	"time"
)

// Spectator is an object that represents either a spectator in an ongoing game
// or a viewer of a dedicated replay
// It is sent directly to the client in the "spectators" command,
// so we ensure that the only valid JSON fields are "name" and "shadowingPlayerIndex"
type Spectator struct {
	ID   int    `json:"-"` // This is equal to the database ID for the user
	Name string `json:"name"`
	// The user session corresponding to the spectator is copied here for convenience
	// The session should always be valid because when a user disconnects,
	// they will automatically stop spectating all games
	Session   *Session  `json:"-"`
	Typing    bool      `json:"-"`
	LastTyped time.Time `json:"-"`

	// Spectators have the ability to watch a game from a specific player's perspective
	// Equal to -1 if they are not shadowing a specific player
	ShadowingPlayerIndex int `json:"shadowingPlayerIndex"`

	Notes []string `json:"-"`
}
