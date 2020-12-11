package constants

import (
	"time"

	"github.com/Zamiell/hanabi-live/server/pkg/bitmask"
)

// iota starts at 0 and counts upwards
// i.e. statusLobby = 0, statusPregame = 1, etc.

// Every player has a status associated with them for the purposes of showing "where they are" on
// the user list in the lobby.
const (
	StatusLobby = iota
	StatusPregame
	StatusPlaying
	StatusSpectating
	StatusReplay
	StatusSharedReplay
)

// When in a game, players can send certain types of "actions" to the server to communicate what
// kind of move they want to perform.
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
// communicate what kind of function they want to perform.
const (
	// This changes the shared turn.
	ReplayActionTypeSegment = iota
	// This highlights a card with an indicator arrow.
	ReplayActionTypeArrow
	// This plays one of the arbitrary sound effects included on the server.
	ReplayActionTypeSound
	// This start a hypothetical line from the current turn.
	ReplayActionTypeHypoStart
	// This ends the current hypothetical line.
	ReplayActionTypeHypoEnd
	// This performs a move in the hypothetical.
	ReplayActionTypeHypoAction
	// This goes back one turn in the hypothetical.
	ReplayActionTypeHypoBack
	// This toggles whether or not drawn cards should be hidden.
	// (Drawn cards are hidden by default.)
	ReplayActionTypeToggleRevealed
	// This changes the current manual efficiency modification.
	// (Players can manually adjust the efficiency to account for cards that are Finessed and so
	// forth.)
	ReplayActionTypeEfficiencyMod
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

const (
	HTTPReadTimeout  = 5 * time.Second
	HTTPWriteTimeout = 10 * time.Second
)

// These are common error messages.
const (
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
)
