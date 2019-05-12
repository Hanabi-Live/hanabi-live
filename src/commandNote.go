/*
	Sent when the user writes a note
	"data" example:
	{
		order: 3,
		note: 'b1, m1',
	}
*/

package main

import (
	"strconv"

	"github.com/microcosm-cc/bluemonday"
)

func commandNote(s *Session, d *CommandData) {
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

	// Validate that the table has started
	if !t.Game.Running {
		s.Warning("Table " + strconv.Itoa(tableID) + " has not started yet.")
		return
	}

	// Validate that they are in the table
	i := t.GameSpec.GetPlayerIndex(s.UserID())
	j := t.GetSpectatorIndex(s.UserID())
	if i == -1 && j == -1 {
		s.Warning("You are in not table " + strconv.Itoa(tableID) + ", so you cannot send a note.")
		return
	}

	// Sanitize the message using the bluemonday library to stop
	// various attacks against other players
	policy := bluemonday.StrictPolicy()
	d.Note = policy.Sanitize(d.Note)

	/*
		Note
	*/

	if i > -1 {
		p := t.GameSpec.Players[i]

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
