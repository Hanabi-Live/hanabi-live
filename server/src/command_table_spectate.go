package main

import (
	"strconv"
)

// commandTableSpectate is sent when:
// 1) the user clicks on the "Spectate" button in the lobby
// 2) the user creates a solo replay
// 3) the user creates a shared replay
// 4) on behalf of a user when they reconnect after having been in a shared replay
//
// Example data:
// {
//   tableID: 15103,
//   // A value of "-1" must be specified if we do not want to shadow a player
//   shadowingPlayerIndex: -1,
// }
func commandTableSpectate(s *Session, d *CommandData) {
	/*
		Validation
	*/

	// Validate that the table exists
	tableID := d.TableID
	var t *Table
	if v, ok := tables[tableID]; !ok {
		s.Warning("Table " + strconv.FormatUint(tableID, 10) + " does not exist.")
		return
	} else {
		t = v
	}
	g := t.Game

	// Validate that the game has started
	if !t.Running {
		s.Warning(ChatCommandNotStartedFail)
		return
	}

	// Validate that they are not already spectating a game
	for _, t2 := range tables {
		for _, sp := range t2.Spectators {
			if sp.ID == s.UserID() {
				if t2.ID == t.ID {
					s.Warning("You are already spectating this table.")
				} else {
					s.Warning("You are already spectating another table.")
				}
				return
			}
		}
	}

	// Validate the shadowing player index
	// (if provided, they want to spectate from a specific player's perspective)
	if d.ShadowingPlayerIndex != -1 {
		if d.ShadowingPlayerIndex < 0 || d.ShadowingPlayerIndex > len(t.Players)-1 {
			s.Warning("That is an invalid player index to shadow.")
			return
		}
	}

	/*
		Spectate / Join Solo Replay / Join Shared Replay
	*/

	if t.Replay {
		logger.Info(t.GetName() + "User \"" + s.Username() + "\" joined the replay.")
	} else {
		logger.Info(t.GetName() + "User \"" + s.Username() + "\" spectated.")
	}

	// Add them to the spectators object
	sp := &Spectator{
		ID:                   s.UserID(),
		Name:                 s.Username(),
		Session:              s,
		ShadowingPlayerIndex: d.ShadowingPlayerIndex,
		Notes:                make([]string, g.GetNotesSize()),
	}
	t.Spectators = append(t.Spectators, sp)
	notifyAllTable(t)    // Update the spectator list for the row in the lobby
	t.NotifySpectators() // Update the in-game spectator list

	// Set their status
	status := StatusSpectating
	table := t.ID
	if t.Replay {
		if t.Visible {
			status = StatusSharedReplay
		} else {
			status = StatusReplay
			table = 0 // Protect the privacy of a user in a solo replay
		}
	}
	if s != nil {
		s.Set("status", status)
		s.Set("table", table)
		notifyAllUser(s)
	}

	// Send them a "tableStart" message
	// After the client receives the "tableStart" message, they will send a "getGameInfo1" command
	// to begin the process of loading the UI and putting them in the game
	s.NotifyTableStart(t)
}
