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
)

const (
	ReplayActionTypeTurn  = iota // Changing the shared turn
	ReplayActionTypeArrow        // Highlighting a card with an indicator arrow
	ReplayActionTypeLeaderTransfer
	ReplayActionTypeSound      // Play one of the arbitrary sound effects included on the server
	ReplayActionTypeHypoStart  // Start a hypothetical line
	ReplayActionTypeHypoEnd    // End a hypothetical line
	ReplayActionTypeHypoAction // Perform a move in the hypothetical
	ReplayActionTypeHypoBack   // Go back one turn in the hypothetical
)

var (
	// The amount of time that a game is inactive before it is killed by the server
	idleGameTimeout    = time.Minute * 30
	idleGameTimeoutDev = time.Hour * 24 * 7 // 7 days
)

const (
	// The maximum amount of clues (and the amount of clues that players start the game with)
	MaxClueNum = 8

	// The amount of time that someone can be on the waiting list
	IdleWaitingListTimeout = time.Hour * 8

	// The amount of time that players have to finish their game once
	// a server shutdown or restart is initiated
	ShutdownTimeout = time.Minute * 30

	// The amount of time in between allowed @here Discord alerts
	DiscordAtHereTimeout = time.Hour * 2

	// Common error messages
	DefaultErrorMsg           = "Something went wrong. Please contact an administrator."
	CreateGameFail            = "Failed to create the game. Please contact an administrator."
	StartGameFail             = "Failed to start the game. Please contact an administrator."
	InitGameFail              = "Failed to initialize the game. Please contact an administrator."
	ChatCommandNotInLobbyFail = "You can only perform this command from the lobby."
	ChatCommandNotInGameFail  = "You can only perform this command while in a game."
	ChatCommandStartedFail    = "The game is already started, so you cannot use that command."
	ChatCommandNotOwnerFail   = "Only the table owner can use that command."
	ChatCommandNotDiscordFail = "You can only perform this command from the Hanabi Discord server."
)
