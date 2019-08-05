package main

import (
	"github.com/Zamiell/hanabi-live/src/models"
)

// We separate the player object into two different objects
// This is the object that represents the player before the game has started
type Player struct {
	ID      int // This is equal to the database ID for the user
	Name    string
	Session *Session
	Present bool
	Stats   models.Stats
}
