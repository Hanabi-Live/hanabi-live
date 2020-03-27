package main

import (
	"time"
)

type Spectator struct {
	ID        int
	Name      string
	Session   *Session
	Typing    bool
	LastTyped time.Time

	// Spectators have the ability to watch a game from a specific player's perspective
	Shadowing   bool
	PlayerIndex int // Equal to the index of the player they are shadowing, or -1 otherwise

	Notes []string
}
