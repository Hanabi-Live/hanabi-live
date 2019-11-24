package main

import (
	"time"
)

// iota starts at 0 and counts upwards
// i.e. statusLobby = 0, statusPregame = 1, etc.

const (
	statusLobby = iota
	statusPregame
	statusPlaying
	statusSpectating
	statusReplay
	statusSharedReplay
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
	actionTypeClue = iota
	actionTypePlay
	actionTypeDiscard
	actionTypeDeckPlay
	actionTypeTimeLimitReached
	actionTypeIdleLimitReached
)

const (
	clueTypeRank = iota
	clueTypeColor
)

const (
	endConditionInProgress = iota
	endConditionNormal
	endConditionStrikeout
	endConditionTimeout
	endConditionAbandoned
	endConditionSpeedrunFail
)

const (
	replayActionTypeTurn  = iota // Changing the shared turn
	replayActionTypeArrow        // Highlighting a card with an indicator arrow
	replayActionTypeLeaderTransfer
	replayActionTypeSound      // Play one of the arbitrary sound effects included on the server
	replayActionTypeHypoStart  // Start a hypothetical line
	replayActionTypeHypoEnd    // End a hypothetical line
	replayActionTypeHypoAction // Perform a move in the hypothetical
	replayActionTypeHypoBack   // Go back one turn in the hypothetical
)

var (
	// The amount of time that a game is inactive before it is killed by the server
	idleGameTimeout    = time.Minute * 30
	idleGameTimeoutDev = time.Hour * 24 * 7 // 7 days
)

const (
	// The maximum amount of clues (and the amount of clues that players start the game with)
	maxClueNum = 8

	// The amount of time that someone can be on the waiting list
	idleWaitingListTimeout = time.Hour * 8

	// The amount of time in between allowed @here Discord alerts
	discordAtHereTimeout = time.Hour * 2

	// Common error messages
	initFail = "Failed to initialize the game. Please contact an administrator."

	// Discord emotes
	pogChamp   = "<:PogChamp:254683883033853954>"
	bibleThump = "<:BibleThump:254683882601840641>"
)
