package table

// spectator is an object that represents either a spectator in an ongoing game or a viewer of a
// dedicated replay.
type spectator struct {
	userID   int
	username string

	typing bool
	// lastTyped time.Time

	// Spectators have the ability to watch a game from a specific player's perspective
	// Equal to -1 if they are not shadowing a specific player
	shadowingPlayerIndex int

	notes []string
}
