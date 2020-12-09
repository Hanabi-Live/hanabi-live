package constants

import (
	"time"

	"github.com/Zamiell/hanabi-live/server/pkg/util"
)

// iota starts at 0 and counts upwards
// i.e. statusLobby = 0, statusPregame = 1, etc.

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
	ActionTypeEndGame // Players cannot send this (internal only)
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
	ScoreModifierDeckPlays util.Bitmask = 1 << iota // e.g. 1, 2, 4, and so forth
	ScoreModifierEmptyClues
	ScoreModifierOneExtraCard
	ScoreModifierOneLessCard
	ScoreModifierAllOrNothing
)

const (
	// The maximum amount of clues (and the amount of clues that players start the game with)
	MaxClueNum = 8

	// The maximum amount of strikes/misplays allowed before the game ends
	MaxStrikeNum = 3

	// Currently, in all variants, you get 5 points per suit/stack,
	// but this may not always be the case
	PointsPerSuit = 5
)

const (
	HTTPReadTimeout  = 5 * time.Second
	HTTPWriteTimeout = 10 * time.Second
)
