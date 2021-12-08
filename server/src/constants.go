package main

import (
	"time"
)

// iota starts at 0 and counts upwards
// i.e. StatusLobby = 0, StatusPregame = 1, etc.

// Every player has a status associated with them for the purposes of showing "where they are" on
// the user list in the lobby
const (
	StatusLobby = iota
	StatusPregame
	StatusPlaying
	StatusSpectating
	StatusReplay
	StatusSharedReplay
)

// When in a game, players can send certain types of "actions" to the server to communicate what
// kind of move they want to perform
const (
	ActionTypePlay = iota
	ActionTypeDiscard
	ActionTypeColorClue
	ActionTypeRankClue
	ActionTypeVote
	ActionTypeEndGame // Players cannot send this (internal only)
	ActionTypeEndGameByVote
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
	EndConditionTerminatedByVote
	EndConditionSpeedrunFail
	EndConditionIdleTimeout
	EndConditionCharacterSoftlock
	EndConditionAllOrNothingFail
	EndConditionAllOrNothingSoftlock
)

// When in a shared replay, spectators can send certain types of "actions" to the server to
// communicate what kind of function they want to perform
const (
	// Changing the shared turn
	ReplayActionTypeSegment = iota
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
	// Players can manually adjust the efficiency to account for cards that are Finessed
	ReplayActionTypeEfficiencyMod
)

// Certain types of optional game settings can make the game easier
// We need to keep track of these options when determining the maximum score for a particular
// variant
const (
	ScoreModifierDeckPlays Bitmask = 1 << iota // e.g. 1, 2, 4, and so forth
	ScoreModifierEmptyClues
	ScoreModifierOneExtraCard
	ScoreModifierOneLessCard
	ScoreModifierAllOrNothing
)

const (
	WebsiteName = "Hanab Live"

	// The maximum amount of clues (and the amount of clues that players start the game with)
	MaxClueNum = 8

	// The maximum amount of strikes/misplays allowed before the game ends
	MaxStrikeNum = 3

	// Currently, in all variants, you get 5 points per suit/stack,
	// but this may not always be the case
	PointsPerSuit = 5

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
