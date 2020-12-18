package table

import (
	"time"

	"github.com/Zamiell/hanabi-live/server/pkg/models"
)

// Player is the object that represents the player before the game has started.
// (We separate the player object into two different objects;
// one for the table and one for the game.)
type Player struct {
	UserID int // This is equal to the database ID for the user
	Name   string
	// The user session corresponding to the player is copied here for convenience
	// Even if the user disconnects, the orphaned session will remain,
	// and it is safe to manually perform actions on their behalf with the orphaned session
	// Session   *Session `json:"-"` // Skip when serializing // TODO
	Present   bool
	Stats     *PregameStats
	Typing    bool
	LastTyped time.Time
}
type PregameStats struct {
	NumGames int                  `json:"numGames"`
	Variant  *models.UserStatsRow `json:"variant"`
}
