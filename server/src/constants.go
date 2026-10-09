package main

import (
	"time"
)

const (
	WebsiteName = "Hanab Live"

	// The maximum amount of clues (and the amount of clues that players start the game with)
	MaxClueNum = 8

	// The maximum amount of strikes/misplays allowed before the game ends
	MaxStrikeNum = 3

	// Currently, in all variants, you get 5 points per suit/stack,
	// but this may not always be the case
	DefaultPointsPerSuit = 5

	DefaultVariantName = "No Variant"

	// A "reversed" version of every suit exists
	SuitReversedSuffix = " Reversed"

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
	NotInTwoPlayers = "You can only perform this command when there are more than two players."
)

var (
	DefaultNumCardsPerHand = map[int]int{
		2: 5,
		3: 5,
		4: 4,
		5: 4,
		6: 3,
	}
)
