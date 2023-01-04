package main

import (
	"time"
)

// Spectator is an object that represents either a spectator in an ongoing game
// or a viewer of a dedicated replay
// It is sent directly to the client in the "spectators" command,
// so we ensure that the only valid JSON fields are "name" and "shadowingPlayerIndex"
type Spectator struct {
	UserID int    `json:"-"` // This is equal to the database ID for the user
	Name   string `json:"name"`
	// The user session corresponding to the spectator is copied here for convenience
	// The session should always be valid because when a user disconnects,
	// they will automatically stop spectating all games
	Session   *Session  `json:"-"`
	Typing    bool      `json:"-"`
	LastTyped time.Time `json:"-"`

	// Spectators have the ability to watch a game from a specific player's perspective
	// Equal to -1 if they are not shadowing a specific player
	ShadowingPlayerIndex        int `json:"shadowingPlayerIndex"`
	ShadowingPlayerPregameIndex int `json:"-"`

	// Spectators can add notes to cards that other spectators can see
	notes []string `json:"-"`
}

// The default value is conceptually an empty string for each card in the deck,
// but we don't know the size of the deck until the game starts,
// so we provide this accessor method so that you can only access the notes after the game starts.
func (sp *Spectator) Notes(g *Game) []string {
	if sp.notes == nil {
		sp.notes = make([]string, g.GetNotesSize())
	}
	return sp.notes
}
