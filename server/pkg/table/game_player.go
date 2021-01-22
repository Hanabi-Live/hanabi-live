// This file contains the definition for GamePlayer as well as its main functions
// (that relate to in-game actions)

package table

import (
	"time"
)

// gamePlayer is the object that represents the game state related aspects of the player.
// (We separate the player object into two different objects;
// one for the table and one for the game.)
type gamePlayer struct {
	// Some entries are copied from the Player object for convenience
	Name  string
	Index int
	game  *game // This is a reference to the parent game

	// These relate to the game state
	Hand              []*card
	Time              time.Duration
	Notes             []string
	RequestedPause    bool
	Character         string
	CharacterMetadata int
}
