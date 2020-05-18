package main

import (
	"strconv"
)

// commandTableUnattend is sent when the user clicks on the "Lobby" button while they are:
// 1) playing in an ongoing game
// 2) spectating an ongoing game
// 3) viewing a reply or shared replay
//
// Example data:
// {
//   tableID: 5,
// }
func commandTableUnattend(s *Session, d *CommandData) {
	// Validate that the table exists
	tableID := d.TableID
	var t *Table
	if v, ok := tables[tableID]; !ok {
		// Unlike other command handlers,
		// we do not want to show a warning to the user if the table does not exist
		// In some cases, network latency will cause the "unattend" message to get to the server
		// after the respective table has already been deleted
		return
	} else {
		t = v
	}

	// Validate that they are either playing or spectating the game
	i := t.GetPlayerIndexFromID(s.UserID())
	j := t.GetSpectatorIndexFromID(s.UserID())
	if i == -1 && j == -1 {
		s.Warning("You are not playing or spectating at table " + strconv.Itoa(t.ID) + ", " +
			"so you cannot unattend it.")
		return
	}
	if t.Replay && j == -1 {
		s.Warning("You are not spectating replay " + strconv.Itoa(t.ID) + ", " +
			"so you cannot unattend it.")
		return
	}

	// Set their status
	if s != nil {
		s.Set("status", StatusLobby)
		notifyAllUser(s)
	}

	// If they were typing, remove the message
	t.NotifyChatTyping(s.Username(), false)

	if !t.Replay && i != -1 {
		commandTableUnattendPlayer(s, t, i)
	} else {
		commandTableUnattendSpectator(t, j)
	}
}

func commandTableUnattendPlayer(s *Session, t *Table, i int) {
	// Set their "present" variable to false, which will turn their name red
	// (or set them to "AWAY" if the game has not started yet)
	p := t.Players[i]
	p.Present = false

	if t.Running {
		t.NotifyConnected()
	} else {
		t.NotifyPlayerChange()
	}
}

func commandTableUnattendSpectator(t *Table, j int) {
	// If this is an ongoing game, create a list of any notes that they wrote
	cardOrderList := make([]int, 0)
	if !t.Replay {
		sp := t.Spectators[j]
		for i, note := range sp.Notes {
			if note != "" {
				cardOrderList = append(cardOrderList, i)
			}
		}
	}

	// Remove them from the spectators slice
	t.Spectators = append(t.Spectators[:j], t.Spectators[j+1:]...)

	if t.Replay && len(t.Spectators) == 0 {
		// This was the last person to leave the replay, so delete it
		logger.Info("Ended replay #" + strconv.Itoa(t.ID) + " because everyone left.")
		delete(tables, t.ID)

		// Notify everyone that the table was deleted
		notifyAllTableGone(t)
		return
	}

	notifyAllTable(t)    // Update the spectator list for the row in the lobby
	t.NotifySpectators() // Update the in-game spectator list

	if !t.Replay && len(cardOrderList) > 0 {
		// Since this is a spectator leaving an ongoing game, all of their notes will be deleted
		// Send the other spectators a message about the new list of notes, if any
		for _, order := range cardOrderList {
			t.NotifySpectatorsNote(order)
		}
	}
}
