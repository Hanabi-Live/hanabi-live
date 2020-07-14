package main

import (
	"time"
)

// iota starts at 0 and counts upwards
// i.e. statusLobby = 0, statusPregame = 1, etc.

const (
	StatusLobby = iota
	StatusPregame
	StatusPlaying
	StatusSpectating
	StatusReplay
	StatusSharedReplay
)

var (
	status = []string{
		"Lobby",
		"Pre-Game",
		"Playing",
		"Spectating",
		"Replay",
		"Shared Replay",
	}
)

const (
	ActionTypePlay = iota
	ActionTypeDiscard
	ActionTypeColorClue
	ActionTypeRankClue
	ActionTypeGameOver
)

const (
	ClueTypeColor = iota
	ClueTypeRank
)

const (
	EndConditionInProgress = iota
	EndConditionNormal
	EndConditionStrikeout
	EndConditionTimeout
	EndConditionTerminated
	EndConditionSpeedrunFail
	EndConditionIdleTimeout
	EndConditionCharacterSoftlock
)

const (
	// Changing the shared turn
	ReplayActionTypeTurn = iota
	// Highlighting a card with an indicator arrow
	ReplayActionTypeArrow
	// Play one of the arbitrary sound effects included on the server
	ReplayActionTypeSound
	// Start a hypothetical line
	ReplayActionTypeHypoStart
	// End a hypothetical line
	ReplayActionTypeHypoEnd
	// Perform a move in the hypothetical
	ReplayActionTypeHypoAction
	// Go back one turn in the hypothetical
	ReplayActionTypeHypoBack
	// Toggle whether or not drawn cards should be hidden (true by default)
	ReplayActionTypeToggleRevealed
)

const (
	ScoreModifierDeckPlays Bitmask = 1 << iota // e.g. 1, 2, 4, and so forth
	ScoreModifierEmptyClues
	ScoreModifierOneExtraCard
	ScoreModifierOneLessCard
	ScoreModifierAllOrNothing
)

var (
	// The amount of time that a game is inactive before it is killed by the server
	idleGameTimeout = time.Minute * 30
)

const (
	// The maximum amount of clues (and the amount of clues that players start the game with)
	MaxClueNum = 8

	// The maximum amount of strikes/misplays allowed before the game ends
	MaxStrikeNum = 3

	// Currently, in all variants, you get 5 points per suit/stack,
	// but this may not always be the case
	PointsPerSuit = 5

	// The amount of time that someone can be on the waiting list
	IdleWaitingListTimeout = time.Hour * 8

	// The amount of time that players have to finish their game once
	// a server shutdown or restart is initiated
	ShutdownTimeout = time.Minute * 30

	// A "reversed" version of every suit exists
	SuitReversedSuffix = " Reversed"

	// The amount of time in between allowed @here Discord alerts
	DiscordAtHereTimeout = time.Hour * 2

	// We want to validate string inputs for too many consecutive diacritics
	// This prevents the attack where messages can have a lot of diacritics and cause overflow
	// into sections above and below the text
	ConsecutiveDiacriticsAllowed = 3

	// Common error messages
	DefaultErrorMsg           = "Something went wrong. Please contact an administrator."
	CreateGameFail            = "Failed to create the game. Please contact an administrator."
	StartGameFail             = "Failed to start the game. Please contact an administrator."
	InitGameFail              = "Failed to initialize the game. Please contact an administrator."
	ChatCommandNotInLobbyFail = "You can only perform this command from the lobby."
	ChatCommandNotInGameFail  = "You can only perform this command while in a game."
	ChatCommandNotReplayFail  = "You can only perform this command while in a replay."
	ChatCommandStartedFail    = "The game is already started, so you cannot use that command."
	ChatCommandNotStartedFail = "The game has not started yet, so you cannot use that command."
	ChatCommandNotOwnerFail   = "Only the table owner can use that command."
	ChatCommandNotDiscordFail = "You can only perform this command from the Hanabi Discord server."
)
