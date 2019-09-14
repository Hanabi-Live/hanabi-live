package main

import (
	"github.com/Zamiell/hanabi-live/src/models"
)

// Player is the object that represents the player before the game has started
// (we separate the player object into two different objects;
// one for the table and one for the game)
type Player struct {
	ID      int // This is equal to the database ID for the user
	Name    string
	Session *Session
	Present bool
	Stats   Stats
}
type Stats struct {
	NumGames int                 `json:"numGames"`
	Variant  models.UserStatsRow `json:"variant"`
}
