package table

import (
	"time"
)

// spectator is an object that represents either a spectator in an ongoing game or a viewer of a
// dedicated replay. It is sent directly to the client in the "spectators" command, so we ensure
// that the only valid JSON fields are "name" and "shadowingPlayerIndex".
// (We want to keep all of the fields public for consistency with the "player" object.)
type spectator struct {
	UserID   int    `json:"-"` // This is equal to the database ID for the user
	Username string `json:"username"`

	Typing    bool      `json:"-"`
	LastTyped time.Time `json:"-"`

	// Spectators have the ability to watch a game from a specific player's perspective
	// Equal to -1 if they are not shadowing a specific player
	ShadowingPlayerIndex int `json:"shadowingPlayerIndex"`

	Notes []string `json:"-"`
}
