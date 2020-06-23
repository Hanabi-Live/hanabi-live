package main

import (
	"regexp"
	"strconv"
	"strings"
)

var (
	// e.g. "room name (#2)" matches "room name" and "2"
	roomNameRegExp = regexp.MustCompile(`^(.*) \(#(\d+)\)$`)
)

// commandTableRestart is sent when the user is in a shared replay of a game and wants to
// start a new game with the same settings as the current game
//
// Example data:
// {
//   tableID: 15103,
// }
func commandTableRestart(s *Session, d *CommandData) {
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

	// Validate that this is a shared replay
	if !t.Replay || !t.Visible {
		s.Warning("Table " + strconv.Itoa(tableID) + " is not a shared replay, " +
			"so you cannot send a restart action.")
		return
	}

	// Validate that this person is spectating the shared replay
	j := t.GetSpectatorIndexFromID(s.UserID())
	if j < -1 {
		s.Warning("You are not in shared replay " + strconv.Itoa(tableID) + ".")
	}

	// Validate that this person is leading the shared replay
	if s.UserID() != t.Owner {
		s.Warning("You cannot restart a game unless you are the leader.")
		return
	}

	// Validate that this person was one of the players in the game
	leaderPlayedInOriginalGame := false
	for _, p := range t.Players {
		if p.ID == s.UserID() {
			leaderPlayedInOriginalGame = true
			break
		}
	}
	if !leaderPlayedInOriginalGame {
		s.Warning("You cannot restart a game unless you played in it.")
		return
	}

	// Validate that there are at least two people in the shared replay
	if len(t.Spectators) < 2 {
		s.Warning("You cannot restart a game unless there are at least two people in it.")
		return
	}

	// Validate that all of the players who played the game are currently spectating
	// the shared replay
	playerSessions := make([]*Session, 0)
	spectatorSessions := make([]*Session, 0)
	for _, sp := range t.Spectators {
		if sp.Session == nil {
			// A spectator's session should never be nil
			// Assume that someone is in the process of reconnecting
			s.Warning("One of the spectators is currently reconnecting. " +
				"Please try restarting again in a few seconds.")
			return
		}
		playedInOriginalGame := false
		for _, p := range t.Players {
			if p.ID == sp.ID {
				playedInOriginalGame = true
				break
			}
		}
		if playedInOriginalGame {
			playerSessions = append(playerSessions, sp.Session)
		} else {
			spectatorSessions = append(spectatorSessions, sp.Session)
		}
	}
	if len(playerSessions) != len(t.Players) {
		s.Warning("Not all of the players from the original game are in the shared replay, " +
			"so you cannot restart the game.")
		return
	}

	// Validate that there is currently no-one on the waiting list
	waitingListPurgeOld()
	if t.AlertWaiters &&
		t.PasswordHash == "" &&
		t.Name != "test" &&
		!strings.HasPrefix(t.Name, "test ") &&
		len(waitingList) > 0 {

		s.Warning("There are one or more players on the waiting list, " +
			"so you should create a new table and let them join.")
		return
	}

	// Validate that the server is not about to go offline
	if checkImminentShutdown(s) {
		return
	}

	// Validate that the server is not undergoing maintenance
	if maintenanceMode {
		s.Warning("The server is undergoing maintenance. " +
			"You cannot start any new games for the time being.")
		return
	}

	// Validate that no-one in the game are currently playing in any other games
	if s.GetJoinedTable() != nil {
		s.Warning("You cannot join more than one table at a time. " +
			"Terminate your other game before restarting a replay.")
		return
	}
	for _, s2 := range playerSessions {
		if s2.GetJoinedTable() != nil {
			s.Warning("You cannot restart the game because " + s2.Username() +
				" is already playing in another game.")
			return
		}
	}

	/*
		Restart
	*/

	// Before the table is deleted, make a copy of the chat, if any
	oldChat := make([]*TableChatMessage, len(t.Chat))
	copy(oldChat, t.Chat)

	// Additionally, make a copy of the ChatRead map
	oldChatRead := make(map[int]int)
	for k, v := range t.ChatRead {
		oldChatRead[k] = v
	}

	// Force the client of all of the spectators to go back to the lobby
	t.NotifyBoot()

	// On the server side, all of the spectators will still be in the game,
	// so manually disconnect everybody
	for _, s2 := range playerSessions {
		commandTableUnattend(s2, &CommandData{
			TableID: t.ID,
		})
	}
	for _, s2 := range spectatorSessions {
		commandTableUnattend(s2, &CommandData{
			TableID: t.ID,
		})
	}

	newTableName := ""

	// Generate a new name for the game based on which iteration of the room this is
	// For example, a game named "logic only" will be "logic only (#2)" and then "logic only (#3)"
	if t.InitialName != "" {
		oldTableName := t.InitialName
		gameNumber := 2 // By default, this is the second game of a particular table
		match := roomNameRegExp.FindAllStringSubmatch(oldTableName, -1)
		if len(match) != 0 {
			oldTableName = match[0][1] // This is the name of the room without the "(#2)" part
			gameNumber, _ = strconv.Atoi(match[0][2])
			gameNumber++
		}
		newTableName = oldTableName + " (#" + strconv.Itoa(gameNumber) + ")"
	} else {
		newTableName = getName()
	}

	// The shared replay should now be deleted, since all of the players have left
	// Now, create the new game but hide it from the lobby
	createTable(s, &CommandData{
		Name:         newTableName,
		Options:      t.Options,
		AlertWaiters: t.AlertWaiters,
	}, false)

	// Find the table ID for the new game
	var t2 *Table
	for _, existingTable := range tables {
		if existingTable.Name == newTableName {
			t2 = existingTable
			break
		}
	}
	if t2 == nil {
		logger.Error("Failed to find the newly created table of \"" + newTableName + "\" " +
			"in the table map.")
		s.Error("Something went wrong when restarting the game. " +
			"Please report this error to an administrator.")
		return
	}

	// Emulate the other players joining the game
	for _, s2 := range playerSessions {
		if s2.UserID() == s.UserID() {
			// The creator of the game does not need to join
			continue
		}
		commandTableJoin(s2, &CommandData{
			TableID: t2.ID,
		})
	}

	// Copy over the old chat
	t2.Chat = make([]*TableChatMessage, len(oldChat))
	copy(t2.Chat, oldChat)

	// Copy over the old ChatRead map
	// (this has to be done after the players join the game)
	t2.ChatRead = make(map[int]int)
	for k, v := range oldChatRead {
		t2.ChatRead[k] = v
	}

	t2.ExtraOptions.Restarted = true

	// Emulate the game owner clicking on the "Start Game" button
	commandTableStart(s, &CommandData{
		TableID: t2.ID,
	})

	// Automatically join any other spectators that were watching
	for _, s2 := range spectatorSessions {
		commandTableSpectate(s2, &CommandData{
			TableID: t2.ID,
		})
	}

	// Add a message to the chat to indicate that the game was restarted
	chatServerSend("The game has been restarted.", "table"+strconv.Itoa(t2.ID))

	// If a user has read all of the chat thus far,
	// mark that they have also read the "restarted" message, since it is superfluous
	for k, v := range t2.ChatRead {
		if v == len(t2.Chat)-1 {
			t2.ChatRead[k] = len(t2.Chat)
		}
	}
}
