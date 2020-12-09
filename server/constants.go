package main

import (
	"time"
)

const (
	WebsiteName = "Hanab Live"

	// The amount of time that players have to finish their game once
	// a server shutdown or restart is initiated
	ShutdownTimeout = time.Minute * 30

	// The amount of time that a game is inactive before it is killed by the server
	IdleGameTimeout = time.Minute * 30

	// We want to validate string inputs for too many consecutive diacritics
	// This prevents the attack where messages can have a lot of diacritics and cause overflow
	// into sections above and below the text
	ConsecutiveDiacriticsAllowed = 3

	// Common error messages
	DefaultErrorMsg = "Something went wrong. Please contact an administrator."
	CreateGameFail  = "Failed to create the game. Please contact an administrator."
	StartGameFail   = "Failed to start the game. Please contact an administrator."
	InitGameFail    = "Failed to initialize the game. Please contact an administrator."
	NotInLobbyFail  = "You can only perform this command from the lobby."
	NotInGameFail   = "You can only perform this command while in a game."
	NotReplayFail   = "You can only perform this command while in a replay."
	StartedFail     = "The game is already started, so you cannot use that command."
	NotStartedFail  = "The game has not started yet, so you cannot use that command."
	NotOwnerFail    = "Only the table owner can use that command."
)
