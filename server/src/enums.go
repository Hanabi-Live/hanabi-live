package main

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
	ActionTypeEndGame // Players cannot send this (internal only)
	ActionTypeEndGameByVote
)

const (
	ClueTypeColor = iota
	ClueTypeRank
)

// Corresponds to values in the database. If changed, the database must also be updated.
// Also see the enum in "EndCondition.ts".
const (
	EndConditionInProgress           = 0
	EndConditionNormal               = 1
	EndConditionStrikeout            = 2
	EndConditionTimeout              = 3
	EndConditionTerminatedByPlayer   = 4
	EndConditionSpeedrunFail         = 5
	EndConditionIdleTimeout          = 6
	EndConditionCharacterSoftlock    = 7
	EndConditionAllOrNothingFail     = 8
	EndConditionAllOrNothingSoftlock = 9
	EndConditionTerminatedByVote     = 10
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

// The direction of a play stack in reversible and up-or-down variants.
const (
	StackDirectionUndecided = iota
	StackDirectionUp
	StackDirectionDown
	StackDirectionFinished
)

// ChatLogSource records the origin of a persisted message independently of user lookup.
type ChatLogSource string

const (
	ChatLogSourceUser ChatLogSource = "user"
	ChatLogSourceServer ChatLogSource = "server"
	ChatLogSourceDiscord ChatLogSource = "discord"
)
