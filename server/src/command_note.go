package main

import (
	"html"
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

	// Validate that it is not a replay
	if t.Replay {
		s.Warning("You can not send a note in a replay.")
		return
	}

	// Validate that they are in the game
	playerIndex := t.GetPlayerIndexFromID(s.UserID)
	spectatorIndex := t.GetSpectatorIndexFromID(s.UserID)
	if playerIndex == -1 && spectatorIndex == -1 {
		s.Warning("You are not at table " + strconv.FormatUint(t.ID, 10) + ", " +
			"so you cannot send a note.")
		return
	}

	// Truncate long notes
	// (we do this first to prevent wasting CPU cycles on validating extremely long notes)
	if len(d.Note) > MaxChatLength {
		d.Note = d.Note[0 : MaxChatLength-1]
	}

	// Remove any non-printable characters, if any
	d.Msg = removeNonPrintableCharacters(d.Msg)

	// Check for valid UTF8
	if !utf8.Valid([]byte(d.Note)) {
		s.Warning("Notes must contain valid UTF8 characters.")
		return
	}

	// Replace any whitespace that is not a space with a space
	msg2 := d.Note
	for _, letter := range msg2 {
		if unicode.IsSpace(letter) && letter != ' ' {
			d.Note = strings.ReplaceAll(d.Note, string(letter), " ")
		}
	}

	// Trim whitespace from both sides
	d.Note = strings.TrimSpace(d.Note)

	// Validate that the note does not contain an unreasonable amount of consecutive diacritics
	// (accents)
	if numConsecutiveDiacritics(d.Note) > ConsecutiveDiacriticsAllowed {
		s.Warning("Notes cannot contain more than " + strconv.Itoa(ConsecutiveDiacriticsAllowed) +
			" consecutive diacritics.")
		return
	}

	// Escape all HTML special characters (to stop various attacks against other players)
	d.Msg = html.EscapeString(d.Msg)

	logger.Debug("User \"" + s.Username + "\" submitted a note of: " + d.Msg)
	note(d, t, playerIndex, spectatorIndex)
}

func note(d *CommandData, t *Table, playerIndex int, spectatorIndex int) {
	// Local variables
	g := t.Game

	if playerIndex > -1 {
		p := g.Players[playerIndex]

		// Update the array that contains all of their notes
		p.Notes[d.Order] = d.Note
	} else if spectatorIndex > -1 {
		sp := t.Spectators[spectatorIndex]

		// Update the array that contains all of their notes
		sp.Notes[d.Order] = d.Note
	}

	// Let all of the spectators know that there is a new note
	t.NotifySpectatorsNote(d.Order)
}
