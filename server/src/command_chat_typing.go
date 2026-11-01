package main

import (
	"context"
	"strconv"
	"time"
)

const (
	TypingDelay = 2 * time.Second
)

// commandChatTyping is sent when the user types something into a chat box
//
// Example data:
//
//	{
//	  tableID: 15103,
//	}
func commandChatTyping(ctx context.Context, s *Session, d *CommandData) {
	t, exists := getTableAndLock(ctx, s, d.TableID, !d.NoTableLock, !d.NoTablesLock)
	if !exists {
		return
	}
	if !d.NoTableLock {
		defer t.Unlock(ctx)
	}

	// Validate that they are in the game or are a spectator
	playerIndex := t.GetPlayerIndexFromID(s.UserID)
	spectatorIndex := t.GetSpectatorIndexFromID(s.UserID)
	if !t.IsPlayerOrSpectating(s.UserID) {
		s.Warning("You are not playing or spectating at table " + strconv.FormatUint(t.ID, 10) +
			", so you cannot report that you are typing.")
		return
	}
	if !t.IsActivelySpectating(s.UserID) && t.Replay {
		s.Warning("You are not spectating replay " + strconv.FormatUint(t.ID, 10) +
			", so you cannot report that you are typing.")
		return
	}

	chatTyping(ctx, s, t, playerIndex, spectatorIndex)
}

func chatTyping(ctx context.Context, s *Session, t *Table, playerIndex int, spectatorIndex int) {
	// Update the "LastTyped" and "Typing" fields
	// Check for spectators first in case this is a shared replay that the player happened to be in
	name := ""
	if spectatorIndex != -1 {
		sp := t.Spectators[spectatorIndex]
		sp.LastTyped = time.Now()
		if !sp.Typing {
			sp.Typing = true
			name = sp.Name
		}
	} else if playerIndex != -1 {
		p := t.Players[playerIndex]
		p.LastTyped = time.Now()
		if !p.Typing {
			p.Typing = true
			name = p.Name
		}
	}

	if name != "" {
		// They were not already typing, so send a message to everyone else
		t.NotifyChatTyping(name, true)
	}

	userID := s.UserID
	t.cancelTypingTimer(userID)
	if t.typingTimers == nil {
		t.typingTimers = make(map[int]*time.Timer)
	}
	t.typingTimers[userID] = time.AfterFunc(TypingDelay, func() {
		chatTypingCheckStopped(ctx, t, userID)
	})
}

func chatTypingCheckStopped(ctx context.Context, t *Table, userID int) {
	incomingCommands.enterDeferred()
	defer incomingCommands.leave()

	// Check to see if the table still exists
	t2, exists := getTableAndLock(ctx, nil, t.ID, true, true)
	if !exists {
		return
	}
	defer t2.Unlock(ctx)
	if t != t2 {
		return
	}

	// Validate that they are in the game or are a spectator
	playerIndex := t.GetPlayerIndexFromID(userID)
	spectatorIndex := t.GetSpectatorIndexFromID(userID)
	if !t.IsPlayerOrSpectating(userID) {
		t.cancelTypingTimer(userID)
		// They left the game shortly after they started typing
		// The "typing" message is automatically removed when a player leaves a table,
		// so we do not have to do anything
		return
	}
	if !t.IsActivelySpectating(userID) && t.Replay {
		t.cancelTypingTimer(userID)
		// Same as above
		return
	}

	// Check for spectators first in case this is a shared replay that the player happened to be in
	name := ""
	if spectatorIndex != -1 {
		sp := t.Spectators[spectatorIndex]
		if !sp.Typing {
			t.cancelTypingTimer(userID)
			return
		}
		if time.Since(sp.LastTyped) >= TypingDelay {
			sp.Typing = false
			name = sp.Name
		}
	} else if playerIndex != -1 {
		p := t.Players[playerIndex]
		if !p.Typing {
			t.cancelTypingTimer(userID)
			return
		}
		if time.Since(p.LastTyped) >= TypingDelay {
			p.Typing = false
			name = p.Name
		}
	}

	if name != "" {
		t.cancelTypingTimer(userID)
		// They have not typed anything for X seconds, so assume that they are finished typing
		t.NotifyChatTyping(name, false)
	}
}
