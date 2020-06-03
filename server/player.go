package main

import (
	"time"
)

// Player is the object that represents the player before the game has started
// (we separate the player object into two different objects;
// one for the table and one for the game)
type Player struct {
	ID        int // This is equal to the database ID for the user
	Name      string
	Session   *Session
	Present   bool
	Stats     PregameStats
	Typing    bool
	LastTyped time.Time
}
type PregameStats struct {
	NumGames int          `json:"numGames"`
	Variant  UserStatsRow `json:"variant"`
}
