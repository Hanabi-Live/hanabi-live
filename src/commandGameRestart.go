/*
	Sent when the user is in a shared replay of a speedrun table
	and wants to start a new table with the same settings as the current table
	"data" is empty
*/

package main

import (
	"strconv"
)

func commandGameRestart(s *Session, d *CommandData) {
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

	// Validate that this is a shared replay
	if !t.Game.Replay || !t.Visible {
		s.Warning("Table " + strconv.Itoa(tableID) + " is not a shared replay, so you cannot send a restart action.")
		return
	}

	// Validate that this person is leading the shared replay
	if s.UserID() != t.Owner {
		s.Warning("You cannot restart a table unless you are the leader.")
		return
	}

	// Validate that there are at least two people in the shared replay
	if len(t.Spectators) < 2 {
		s.Warning("You cannot restart a table unless there are at least two people in it.")
		return
	}

	// Validate that all of the players who played the table are currently spectating
	// the shared replay
	playerSessions := make([]*Session, 0)
	spectatorSessions := make([]*Session, 0)
	for _, sp := range t.Spectators {
		playedInOriginalTable := false
		for _, p := range t.GameSpec.Players {
			if p.Name == sp.Name {
				playedInOriginalTable = true
				break
			}
		}
		if playedInOriginalTable {
			playerSessions = append(playerSessions, sp.Session)
		} else {
			spectatorSessions = append(spectatorSessions, sp.Session)
		}
	}
	if len(playerSessions) != len(t.GameSpec.Players) {
		s.Warning("Not all of the players from the original table are in the shared replay, " +
			"so you cannot restart the table.")
		return
	}

	/*
		Restart
	*/

	// Force the client of all of the spectators to go back to the lobby
	t.NotifyBoot()

	// On the server side, all of the spectators will still be in the table,
	// so manually disconnect everybody
	for _, s2 := range playerSessions {
		commandGameUnattend(s2, nil)
	}
	for _, s2 := range spectatorSessions {
		commandGameUnattend(s2, nil)
	}

	// The shared replay should now be deleted, since all of the players have left
	// Now, emulate the table owner creating a new table
	commandTableCreate(s, &CommandData{
		Name:                 getName(), // Generate a random name for the new table
		Variant:              t.GameSpec.Options.Variant,
		Timed:                t.GameSpec.Options.Timed,
		BaseTime:             t.GameSpec.Options.BaseTime,
		TimePerTurn:          t.GameSpec.Options.TimePerTurn,
		Speedrun:             t.GameSpec.Options.Speedrun,
		DeckPlays:            t.GameSpec.Options.DeckPlays,
		EmptyClues:           t.GameSpec.Options.EmptyClues,
		CharacterAssignments: t.GameSpec.Options.CharacterAssignments,
	})

	// We increment the newTableID after creating a table,
	// so assume that the ID of the last table created is equal to the "newTableID" minus 1
	prevTableID := newTableID - 1
	g2 := tables[prevTableID]

	// Copy over the chat from the previous table, if any
	g2.Chat = t.Chat
	for k, v := range t.ChatRead {
		g2.ChatRead[k] = v
	}

	// Emulate the other players joining the table
	for _, s2 := range playerSessions {
		if s2.UserID() == s.UserID() {
			// The creator of the table does not need to join
			continue
		}
		commandTableJoin(s2, &CommandData{
			TableID: prevTableID,
		})
	}

	// Emulate the table owner clicking on the "Start Table" button
	commandGameStart(s, nil)

	// Automatically join any other spectators that were watching
	for _, s2 := range spectatorSessions {
		commandTableSpectate(s2, &CommandData{
			TableID: prevTableID,
		})
	}
}
