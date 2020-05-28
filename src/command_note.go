package main

import (
	"strconv"
	"strings"
	"unicode"
	"unicode/utf8"
)

// commandNote is sent when the user writes a note
//
// Example data:
// {
//   tableID: 5,
//   order: 3,
//   note: 'b1, m1',
// }
func commandNote(s *Session, d *CommandData) {
	/*
		Validate
		(some code is copied from the "sanitizeChatInput()" function)
	*/

	// Validate that the table exists
	tableID := d.TableID
	var t *Table
	if v, ok := tables[tableID]; !ok {
		s.Warning("Table " + strconv.Itoa(tableID) + " does not exist.")
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

	// Validate that it is not a replay
	if t.Replay {
		s.Warning("You can not send a note in a replay.")
		return
	}

	// Validate that they are in the game
	i := t.GetPlayerIndexFromID(s.UserID())
	j := t.GetSpectatorIndexFromID(s.UserID())
	if i == -1 && j == -1 {
		s.Warning("You are not at table " + strconv.Itoa(tableID) + ", so you cannot send a note.")
		return
	}

	// Truncate long notes
	// (we do this first to prevent wasting CPU cycles on validating extremely long notes)
	if len(d.Note) > MaxChatLength {
		d.Note = d.Note[0 : MaxChatLength-1]
	}

	// Check for valid UTF8
	if !utf8.Valid([]byte(d.Note)) {
		s.Warning("Notes must be valid UTF8.")
		return
	}

	// Replace any whitespace that is not a space with a space
	msg2 := d.Note
	for _, letter := range msg2 {
		if unicode.IsSpace(letter) && letter != ' ' {
			d.Note = strings.ReplaceAll(d.Note, string(letter), " ")
		}
	}

	// Trim whitespace from both sides of the note
	d.Note = strings.TrimSpace(d.Note)

	// Validate that the note does not contain an unreasonable amount of consecutive diacritics
	// (accents)
	if numConsecutiveDiacritics(d.Note) > ConsecutiveDiacriticsAllowed {
		s.Warning("Notes cannot contain more than " + strconv.Itoa(ConsecutiveDiacriticsAllowed) +
			" consecutive diacritics.")
		return
	}

	// Sanitize the message using the bluemonday library to stop
	// various attacks against other players
	d.Note = bluemondayStrictPolicy.Sanitize(d.Note)

	/*
		Note
	*/

	if i > -1 {
		p := g.Players[i]

		// Update the array that contains all of their notes
		p.Notes[d.Order] = d.Note
	} else if j > -1 {
		sp := t.Spectators[j]

		// Update the array that contains all of their notes
		sp.Notes[d.Order] = d.Note
	}

	// Let all of the spectators know that there is a new note
	t.NotifySpectatorsNote(d.Order)
}
