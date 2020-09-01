package main

import (
	"time"
)

// Player is the object that represents the player before the game has started
// (we separate the player object into two different objects;
// one for the table and one for the game)
type Player struct {
	ID   int // This is equal to the database ID for the user
	Name string
	// The user session corresponding to the player is copied here for convenience
	// Even if the user disconnects, the orphaned session will remain,
	// and it is safe to manually perform actions on their behalf with the orphaned session
	Session   *Session `json:"-"` // Skip when serializing
	Present   bool
	Stats     PregameStats
	Typing    bool
	LastTyped time.Time
}
type PregameStats struct {
	NumGames int           `json:"numGames"`
	Variant  *UserStatsRow `json:"variant"`
}
