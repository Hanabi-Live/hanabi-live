/*
	Sent when the user clicks on the "Lobby" button while they are in the middle of a table
	"data" is empty
*/

package main

import (
	"strconv"
)

func commandGameUnattend(s *Session, d *CommandData) {
	// Set their status
	s.Set("status", statusLobby)
	tableID := s.CurrentTable()
	s.Set("currentTable", -1)
	notifyAllUser(s)

	// Validate that the table exists
	if tableID == -1 {
		// The user may be returning from a replay that was ended due to idleness,
		// or perhaps they lagged and sent two gameUnattend messages,
		// with this one being the second one
		log.Info("User \"" + s.Username() + "\" tried to unattend, " +
			"but their table ID was set to -1.")
		return
	}
	var t *Table
	if v, ok := tables[tableID]; !ok {
		s.Error("Table " + strconv.Itoa(tableID) + " does not exist, so you cannot unattend it.")
		return
	} else {
		t = v
	}

	// Validate that they are either playing or spectating the table
	i := t.GameSpec.GetPlayerIndex(s.UserID())
	j := t.GetSpectatorIndex(s.UserID())
	if i == -1 && j == -1 {
		s.Warning("You are not playing or spectating table " + strconv.Itoa(t.ID) + ".")
		return
	}
	if t.Game.Replay && j == -1 {
		s.Warning("You are not spectating replay " + strconv.Itoa(t.ID) + ".")
		return
	}

	if !t.Game.Replay && i != -1 {
		commandGameUnattendPlayer(s, t, i)
	} else {
		commandGameUnattendSpectator(t, j)
	}
}

func commandGameUnattendPlayer(s *Session, t *Table, i int) {
	// Set their "present" variable to false, which will turn their name red
	// (or set them to "AWAY" if the table has not started yet)
	p := t.GameSpec.Players[i]
	p.Present = false

	if t.Game.Running {
		t.NotifyConnected()
	} else {
		t.NotifyPlayerChange()
	}

	// They got sent a "tableGone" message earlier (if the table started),
	// so send them a new table message
	s.NotifyTable(t)
}

func commandGameUnattendSpectator(t *Table, j int) {
	// If this is an ongoing table, create a list of any notes that they wrote
	cardOrderList := make([]int, 0)
	if !t.Game.Replay {
		sp := t.Spectators[j]
		for i, note := range sp.Notes {
			if note != "" {
				cardOrderList = append(cardOrderList, i)
			}
		}
	}

	// Remove them from the spectators slice
	t.Spectators = append(t.Spectators[:j], t.Spectators[j+1:]...)
	notifyAllTable(t)    // Update the spectator list for the row in the lobby
	t.NotifySpectators() // Update the in-table spectator list

	if t.Game.Replay {
		if len(t.Spectators) == 0 {
			// This was the last person to leave the replay, so delete it
			log.Info("Ended replay #" + strconv.Itoa(t.ID) + " because everyone left.")
			delete(tables, t.ID)

			// Notify everyone that the table was deleted
			notifyAllTableGone(t)
		}
	} else if len(cardOrderList) > 0 {
		// Since this is a spectator leaving an ongoing table, all of their notes will be deleted
		// Send the other spectators a message about the new list of notes, if any
		for _, order := range cardOrderList {
			t.NotifySpectatorsNote(order)
		}
	}
}
