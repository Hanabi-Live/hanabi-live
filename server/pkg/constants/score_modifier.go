package constants

import (
	"github.com/Zamiell/hanabi-live/server/pkg/bitmask"
)

// Certain types of optional game settings can make the game easier.
// We need to keep track of these options when determining the maximum score for a particular
// variant.
const (
	ScoreModifierDeckPlays bitmask.Bitmask = 1 << iota // e.g. 1, 2, 4, and so forth
	ScoreModifierEmptyClues
	ScoreModifierOneExtraCard
	ScoreModifierOneLessCard
	ScoreModifierAllOrNothing
)
