package main

import (
	"time"
)

const (
	// The amount of time that players have to finish their game once
	// a server shutdown or restart is initiated
	ShutdownTimeout = time.Minute * 30

	// The amount of time that a game is inactive before it is killed by the server
	IdleGameTimeout = time.Minute * 30

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
