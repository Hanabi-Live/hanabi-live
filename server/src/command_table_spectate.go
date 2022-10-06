package main

import (
	"context"
	"strconv"
	"time"

	"github.com/Hanabi-Live/hanabi-live/logger"
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
func commandTableSpectate(ctx context.Context, s *Session, d *CommandData) {
	t, exists := getTableAndLock(ctx, s, d.TableID, !d.NoTableLock, !d.NoTablesLock)
	if !exists {
		return
	}
	if !d.NoTableLock {
		defer t.Unlock(ctx)
	}

	// Validate that they are not playing at this table
	if !t.Replay {
		for _, p := range t.Players {
			if p.UserID == s.UserID {
				s.Warning("You cannot spectate a game that you are currently playing.")
				return
			}
		}
	}

	// Validate that they are not already spectating this table
	for _, sp := range t.Spectators {
		if sp.UserID == s.UserID {
			s.Warning("You are already spectating this table.")
			return
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

	tableSpectate(ctx, s, d, t)
}

func tableSpectate(ctx context.Context, s *Session, d *CommandData, t *Table) {
	// Local variables
	g := t.Game

	// Since this is a function that changes a user's relationship to tables,
	// we must acquires the tables lock to prevent race conditions
	if !d.NoTablesLock {
		tables.Lock(ctx)
		defer tables.Unlock(ctx)
	}

	// Validate that they are not already spectating another table
	if len(tables.GetTablesUserSpectating(s.UserID)) > 0 {
		s.Warning("You are already spectating a table, so you cannot spectate table " +
			strconv.FormatUint(t.ID, 10) + ".")
		return
	}

	if t.Replay {
		logger.Info(t.GetName() + "User \"" + s.Username + "\" joined the replay.")
	} else {
		logger.Info(t.GetName() + "User \"" + s.Username + "\" spectated.")
	}

	// They might be reconnecting after a disconnect,
	// so mark that this player is no longer disconnected
	// (this will be a no-op if they were not in the "DisconSpectators" map)
	tables.DeleteDisconSpectating(s.UserID)

	// Add them to the spectators object
	sp := &Spectator{
		UserID:               s.UserID,
		Name:                 s.Username,
		Session:              s,
		Typing:               false,
		LastTyped:            time.Time{},
		ShadowingPlayerIndex: d.ShadowingPlayerIndex,
	}

	t.Spectators = append(t.Spectators, sp)
	tables.AddSpectating(s.UserID, t.ID) // Keep track of user to table relationships

	notifyAllTable(t) // Update the spectator list for the row in the lobby
	if g == nil {
		// Send them the pregame data
		t.NotifyPlayerChange()
	}
	t.NotifySpectators() // Update the in-game spectator list

	// Set their status
	status := StatusSpectating
	tableID := t.ID
	if t.Replay {
		if t.Visible {
			status = StatusSharedReplay
		} else {
			status = StatusReplay
			tableID = 0 // Protect the privacy of a user in a solo replay
		}
	}
	s.SetStatus(status)
	s.SetTableID(tableID)
	notifyAllUser(s)

	if g == nil {
		// They have joined a pregame
		s.NotifyTableJoined(t)

		// Send them the chat history for this game
		chatSendPastFromTable(s, t)

		// Announce the spectator
		msg := s.Username + " joined the table (as a spectator)."
		chatServerSend(ctx, msg, t.GetRoomName(), true)

		// Send them the list of spectators
		t.NotifySpectators()

		// Send them messages for people typing, if any
		for _, p := range t.Players {
			if p.Typing {
				s.NotifyChatTyping(t, p.Name, p.Typing)
			}
		}
	} else {
		// Send them a "tableStart" message
		// After the client receives the "tableStart" message, they will send a "getGameInfo1" command
		// to begin the process of loading the UI and putting them in the game
		s.NotifyTableStart(t)
	}
}
