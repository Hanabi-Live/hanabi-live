/*
	Sent when the user is typing something into the in-game chat box
	"data" is empty
*/

package main

import (
	"strconv"
	"time"
)

const (
	typingDelay = 2 * time.Second
)

func commandChatTyping(s *Session, d *CommandData) {
	/*
		Validate
	*/

	// Validate that the table exists
	tableID := s.CurrentTable()
	var t *Table
	if v, ok := tables[tableID]; !ok {
		s.Warning("Table " + strconv.Itoa(tableID) + " does not exist.")
		return
	} else {
		t = v
	}

	// Validate that they are in the game or are a spectator
	i := t.GetPlayerIndexFromID(s.UserID())
	j := t.GetSpectatorIndexFromID(s.UserID())
	if i == -1 && j == -1 {
		s.Warning("You are not playing or spectating at table " + strconv.Itoa(tableID) + ", " +
			"so you cannot report that you are typing in the chat.")
		return
	}

	/*
		Alert everyone else that this person is now typing
	*/

	// Update the "LastTyped" and "Typing" fields
	name := ""
	if i != -1 {
		// They are a player
		p := t.Players[i]
		p.LastTyped = time.Now()
		if !p.Typing {
			p.Typing = true
			name = p.Name
		}
	} else if j != -1 {
		// They are a spectator
		s := t.Spectators[j]
		s.LastTyped = time.Now()
		if !s.Typing {
			s.Typing = true
			name = s.Name
		}
	}

	if name != "" {
		// They were not already typing, so send a message to everyone else
		t.NotifyChatTyping(name, true)
	}

	// X seconds from now, check to see if they have stopped typing
	go commandChatTypingCheckStopped(t, i, j)
}

func commandChatTypingCheckStopped(t *Table, i int, j int) {
	time.Sleep(typingDelay)
	commandMutex.Lock()
	defer commandMutex.Unlock()

	// Check to see if the table still exists
	if _, ok := tables[t.ID]; !ok {
		return
	}

	name := ""
	if i != 1 {
		// They are a player
		p := t.Players[i]
		if !p.Typing {
			return
		}
		if time.Since(p.LastTyped) >= typingDelay {
			p.Typing = false
			name = p.Name
		}
	} else if j != 1 {
		// They are a spectator
		sp := t.Spectators[j]
		if !sp.Typing {
			return
		}
		if time.Since(sp.LastTyped) >= typingDelay {
			sp.Typing = false
			name = sp.Name
		}
	}

	if name != "" {
		// They have not typed anything for X seconds, so assume that they are finished typing
		t.NotifyChatTyping(name, false)
	}
}
