package main

import (
	"strconv"

	"github.com/microcosm-cc/bluemonday"
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
		s.Warning("The game for table " + strconv.Itoa(tableID) + " has not started yet.")
		return
	}

	// Validate that they are in the game
	i := t.GetPlayerIndexFromID(s.UserID())
	j := t.GetSpectatorIndexFromID(s.UserID())
	if i == -1 && j == -1 {
		s.Warning("You are not at table " + strconv.Itoa(tableID) + ", so you cannot send a note.")
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
