package main

import (
	"context"
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
func commandTableRestart(ctx context.Context, s *Session, d *CommandData) {
	t, exists := getTableAndLock(ctx, s, d.TableID, !d.NoTableLock, !d.NoTablesLock)
	if !exists {
		return
	}
	if !d.NoTableLock {
		defer t.Unlock(ctx)
	}

	// Validate that this is a shared replay
	if !t.Replay || !t.Visible {
		s.Warning("Table " + strconv.FormatUint(t.ID, 10) + " is not a shared replay, " +
			"so you cannot send a restart action.")
		return
	}

	// Validate that this person is spectating the shared replay
	j := t.GetSpectatorIndexFromID(s.UserID)
	if j < -1 {
		s.Warning("You are not in shared replay " + strconv.FormatUint(t.ID, 10) + ".")
		return
	}

	// Validate that this person is leading the shared replay
	if s.UserID != t.OwnerID {
		s.Warning("You cannot restart a game unless you are the leader.")
		return
	}

	// Validate that this person was one of the players in the game
	leaderPlayedInOriginalGame := false
	for _, p := range t.Players {
		if p.UserID == s.UserID {
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
			if p.UserID == sp.UserID {
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

	// Validate that this is not a game with a custom prefix
	if strings.HasPrefix(t.InitialName, "!seed") {
		s.Warning("You are not allowed to restart \"!seed\" games.")
		return
	}
	if strings.HasPrefix(t.InitialName, "!replay") {
		s.Warning("You are not allowed to restart \"!replay\" games.")
		return
	}

	// Validate that the server is not about to go offline
	if checkImminentShutdown(s) {
		return
	}

	// Validate that the server is not undergoing maintenance
	if maintenanceMode.IsSet() {
		s.Warning("The server is undergoing maintenance. " +
			"You cannot start any new games for the time being.")
		return
	}

	tableRestart(ctx, s, d, t, playerSessions, spectatorSessions)
}

func tableRestart(
	ctx context.Context,
	s *Session,
	d *CommandData,
	t *Table,
	playerSessions []*Session,
	spectatorSessions []*Session,
) {
	// Since this is a function that changes a user's relationship to tables,
	// we must acquires the tables lock to prevent race conditions
	if !d.NoTablesLock {
		tables.Lock(ctx)
		defer tables.Unlock(ctx)
	}

	// Validate that the selected players are not playing in another game
	// (this cannot be in the "commandTableRestart()" function because we need the tables lock)
	for _, s2 := range playerSessions {
		if len(tables.GetTablesUserPlaying(s2.UserID)) > 0 {
			s.Warning("You cannot restart the game because " + s2.Username +
				" is already playing in another game.")
			return
		}
	}

	// Before the table is deleted, make a copy of the chat, if any
	oldChat := make([]*TableChatMessage, len(t.Chat))
	copy(oldChat, t.Chat)

	// Additionally, make a copy of the ChatRead map
	oldChatRead := make(map[int]int)
	for k, v := range t.ChatRead {
		oldChatRead[k] = v
	}

	// Force everyone to go back to the lobby
	t.NotifyBoot()

	// On the server side, all of the spectators will still be in the game,
	// so manually disconnect everybody
	for _, s2 := range playerSessions {
		commandTableUnattend(ctx, s2, &CommandData{ // nolint: exhaustivestruct
			TableID:      t.ID,
			NoTableLock:  true,
			NoTablesLock: true,
		})
	}
	for _, s2 := range spectatorSessions {
		commandTableUnattend(ctx, s2, &CommandData{ // nolint: exhaustivestruct
			TableID:      t.ID,
			NoTableLock:  true,
			NoTablesLock: true,
		})
	}

	newTableName := ""

	if t.InitialName == "" {
		// If players spawn a shared replay and then restart,
		// there will not be an initial name for the table
		newTableName = getName()
	} else {
		// Generate a new name for the game based on how many times the players have restarted
		// e.g. "logic only" --> "logic only (#2)" --> "logic only (#3)"
		oldTableName := t.InitialName
		gameNumber := 2 // By default, this is the second game of a particular table
		match := roomNameRegExp.FindAllStringSubmatch(oldTableName, -1)
		if len(match) != 0 {
			oldTableName = match[0][1] // This is the name of the room without the "(#2)" part
			gameNumber, _ = strconv.Atoi(match[0][2])
			gameNumber++
		}
		tableNameSuffix := " (#" + strconv.Itoa(gameNumber) + ")"
		maxGameNameLengthWithoutSuffix := MaxGameNameLength - len(tableNameSuffix)
		if len(oldTableName) > maxGameNameLengthWithoutSuffix {
			oldTableName = oldTableName[0 : maxGameNameLengthWithoutSuffix-1]
		}
		newTableName = oldTableName + tableNameSuffix
	}

	// The shared replay should now be deleted, since all of the players have left
	// Now, create the new game but hide it from the lobby
	commandTableCreate(ctx, s, &CommandData{ // nolint: exhaustivestruct
		Name:    newTableName,
		Options: t.Options,
		// We want to prevent the pre-game from showing up in the lobby for a brief second
		HidePregame:  true,
		NoTablesLock: true,
	})

	// Find the table ID for the new game
	tableList := tables.GetList(false)
	var t2 *Table
	for _, existingTable := range tableList {
		foundTable := false
		existingTable.Lock(ctx)
		if existingTable.Name == newTableName {
			foundTable = true
		}
		existingTable.Unlock(ctx)

		if foundTable {
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

	t2.Lock(ctx)
	defer t2.Unlock(ctx)

	// Emulate the other players joining the game
	for _, s2 := range playerSessions {
		if s2.UserID == s.UserID {
			// The creator of the game does not need to join
			continue
		}
		commandTableJoin(ctx, s2, &CommandData{ // nolint: exhaustivestruct
			TableID:      t2.ID,
			NoTableLock:  true,
			NoTablesLock: true,
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
	commandTableStart(ctx, s, &CommandData{ // nolint: exhaustivestruct
		TableID:      t2.ID,
		NoTableLock:  true,
		NoTablesLock: true,
	})

	// Automatically join any other spectators that were watching
	for _, s2 := range spectatorSessions {
		commandTableSpectate(ctx, s2, &CommandData{ // nolint: exhaustivestruct
			TableID:              t2.ID,
			ShadowingPlayerIndex: -1,
			NoTableLock:          true,
			NoTablesLock:         true,
		})
	}

	// Add a message to the chat to indicate that the game was restarted
	path := "/replay/" + strconv.Itoa(t.ExtraOptions.DatabaseID)
	url := getURLFromPath(path)
	link := "<a href=\"" + url + "\" target=\"_blank\" rel=\"noopener noreferrer\">#" + strconv.Itoa(t.ExtraOptions.DatabaseID) + "</a>"
	msg := "The game has been restarted (from game " + link + ")."
	chatServerSend(ctx, msg, t2.GetRoomName(), true)

	// If a user has read all of the chat thus far,
	// mark that they have also read the "restarted" message, since it is superfluous
	for k, v := range t2.ChatRead {
		if v == len(t2.Chat)-1 {
			t2.ChatRead[k] = len(t2.Chat)
		}
	}
}
