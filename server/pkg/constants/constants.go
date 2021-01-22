package constants

import (
	"time"
)

const (
	HTTPReadTimeout  = 5 * time.Second
	HTTPWriteTimeout = 10 * time.Second
)

// These are common error messages.
const (
	DefaultErrorMsg = "Something went wrong. Please contact an administrator."
	CreateGameFail  = "Failed to create the game. Please contact an administrator."
	StartGameFail   = "Failed to start the game. Please contact an administrator."
	NotInLobbyFail  = "You can only perform this command from the lobby."
	NotInGameFail   = "You can only perform this command while in a game."
	NotReplayFail   = "You can only perform this command while in a replay."
	StartedFail     = "The game is already started, so you cannot use that command."
	NotStartedFail  = "The game has not started yet, so you cannot use that command."
	NotOwnerFail    = "Only the table owner can use that command."
)

// These are constants relating to chat.
const (
	Lobby           = "lobby"
	TableRoomPrefix = "table"
)

const (
	WebsiteName = "Hanab Live"

	// This is the maximum amount of clues.
	// (And the amount of clues that players start the game with.)
	MaxClueNum = 8

	// This is the maximum amount of strikes/misplays allowed before the game ends.
	MaxStrikeNum = 3

	// Currently, in all variants, you get 5 points per suit/stack,
	// but this may not always be the case.
	PointsPerSuit = 5

	// We want to validate string inputs for too many consecutive diacritics.
	// This prevents the attack where messages can have a lot of diacritics and cause overflow
	// into sections above and below the text.
	ConsecutiveDiacriticsAllowed = 3

	// Tags are user-generated strings that can be arbitrarily assigned to games.
	MaxTagLength = 100

	// ShutdownTimeout is the amount of time that players have to finish their game once a graceful
	// server shutdown is initiated.
	ShutdownTimeout = time.Minute * 30
)
