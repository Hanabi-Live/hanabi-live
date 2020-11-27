package main

import (
	"strconv"
	"time"
)

// commandGetGameInfo1 provides some high-level information about the game
// (like the number of players)
// It is sent when the user:
// - is in a game that is starting
// - joins a game that has already started
// - starts a solo replay
// - starts spectating a game
//
// This is sent before the UI is initialized;
// the client will send a "getGameInfo2" command later to get more specific data
//
// Example data:
// {
//   tableID: 5,
// }
func commandGetGameInfo1(s *Session, d *CommandData) {
	t, exists := getTableAndLock(s, d.TableID, !d.NoLock)
	if !exists {
		return
	}
	if !d.NoLock {
		defer t.Mutex.Unlock()
	}

	// Validate that the game has started
	if !t.Running {
		s.Warning(NotStartedFail)
		return
	}

	// Validate that they are either playing or spectating the game
	playerIndex := t.GetPlayerIndexFromID(s.UserID)
	spectatorIndex := t.GetSpectatorIndexFromID(s.UserID)
	if playerIndex == -1 && spectatorIndex == -1 {
		s.Warning("You are not playing or spectating at table " + strconv.FormatUint(t.ID, 10) +
			".")
		return
	}

	getGameInfo1(s, t, playerIndex, spectatorIndex)
}

func getGameInfo1(s *Session, t *Table, playerIndex int, spectatorIndex int) {
	// Local variables
	g := t.Game

	// Create a list of names of the players in this game
	playerNames := make([]string, 0)
	for _, p := range t.Players {
		playerNames = append(playerNames, p.Name)
	}

	// Create a list of the "Detrimental Character Assignments", if enabled
	characterAssignments := make([]int, 0)
	characterMetadata := make([]int, 0)
	if t.Options.DetrimentalCharacters {
		for _, p := range g.Players {
			var characterID int
			if p.Character == "n/a" { // Manually handle the special character for debugging
				characterID = -1
			} else if character, ok := characters[p.Character]; !ok {
				logger.Error("Failed to find the \"" + p.Character + "\" in the characters map.")
				characterID = -1
			} else {
				characterID = character.ID
			}

			characterAssignments = append(characterAssignments, characterID)
			characterMetadata = append(characterMetadata, p.CharacterMetadata)
		}
	}

	ourPlayerIndex := playerIndex
	if ourPlayerIndex == -1 {
		// By default, spectators view the game from the first player's perspective
		ourPlayerIndex = 0

		// If a spectator is viewing a replay of a game that they played in,
		// we want to put them in the same seat
		for i, name := range playerNames {
			if name == s.Username {
				ourPlayerIndex = i
				break
			}
		}
	}

	// Account for if a spectator is shadowing a specific player
	if spectatorIndex != -1 && t.Spectators[spectatorIndex].ShadowingPlayerIndex != -1 {
		ourPlayerIndex = t.Spectators[spectatorIndex].ShadowingPlayerIndex
	}

	pauseQueued := false
	if playerIndex != -1 {
		pauseQueued = g.Players[playerIndex].RequestedPause
	}

	type InitMessage struct {
		// Game settings
		TableID          uint64    `json:"tableID"`
		PlayerNames      []string  `json:"playerNames"`
		Variant          string    `json:"variant"`
		OurPlayerIndex   int       `json:"ourPlayerIndex"`
		Spectating       bool      `json:"spectating"`
		Replay           bool      `json:"replay"`
		DatabaseID       int       `json:"databaseID"`
		HasCustomSeed    bool      `json:"hasCustomSeed"`
		Seed             string    `json:"seed"`
		DatetimeStarted  time.Time `json:"datetimeStarted"`
		DatetimeFinished time.Time `json:"datetimeFinished"`
		Options          *Options  `json:"options"`

		// Character settings
		CharacterAssignments []int `json:"characterAssignments"`
		CharacterMetadata    []int `json:"characterMetadata"`

		// Shared replay settings
		SharedReplay        bool   `json:"sharedReplay"`
		SharedReplayLeader  string `json:"sharedReplayLeader"`
		SharedReplaySegment int    `json:"sharedReplaySegment"`
		SharedReplayEffMod  int    `json:"sharedReplayEffMod"`

		// Other features
		Paused           bool `json:"paused"`
		PausePlayerIndex int  `json:"pausePlayerIndex"`
		PauseQueued      bool `json:"pauseQueued"`
	}

	s.Emit("init", &InitMessage{
		// Game settings
		TableID:          t.ID, // The client needs to know the table ID for chat to work properly
		PlayerNames:      playerNames,
		OurPlayerIndex:   ourPlayerIndex,
		Spectating:       spectatorIndex != -1 && !t.Replay,
		Replay:           t.Replay,
		DatabaseID:       t.ExtraOptions.DatabaseID,
		HasCustomSeed:    g.ExtraOptions.CustomSeed != "",
		Seed:             g.Seed,
		DatetimeStarted:  g.DatetimeStarted,
		DatetimeFinished: g.DatetimeFinished,

		// Optional settings
		Options: t.Options,

		// Character settings
		CharacterAssignments: characterAssignments,
		CharacterMetadata:    characterMetadata,

		// Shared replay settings
		SharedReplay:        t.Replay && t.Visible,
		SharedReplayLeader:  t.GetSharedReplayLeaderName(),
		SharedReplaySegment: g.Turn,
		SharedReplayEffMod:  g.EfficiencyMod,

		// Other features
		Paused:           g.Paused,
		PausePlayerIndex: g.PausePlayerIndex,
		PauseQueued:      pauseQueued,
	})
}
