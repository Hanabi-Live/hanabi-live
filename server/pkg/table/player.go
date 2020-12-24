package table

import (
	"time"

	"github.com/Zamiell/hanabi-live/server/pkg/models"
)

// player is the object that represents the player before the game has started.
// (We separate the player object into two different objects;
// one for the table and one for the game.)
type player struct {
	UserID   int // This is equal to the database ID for the user
	Username string

	Present   bool
	Stats     *pregameStats
	Typing    bool
	LastTyped time.Time
}

type pregameStats struct {
	NumGames int                  `json:"numGames"`
	Variant  *models.UserStatsRow `json:"variant"`
}
