package main

import (
	"context"
	"regexp"
	"strconv"
	"strings"

	"github.com/Hanabi-Live/hanabi-live/logger"
)

var trailingNum = regexp.MustCompile(`^(.*?)(\d+)$`)

// incrementSeedName takes a !seed-style name and either:
// - increments trailing digits, if they exist ("!seed abc1" -> "!seed abc2")
// - or appends "1" if there are no trailing digits ("!seed abc" -> "!seed abc1")
func incrementSeedName(name string) string {
	if m := trailingNum.FindStringSubmatch(name); len(m) == 3 {
		// m[0] = full match
		// m[1] = base (everything before the digits)
		// m[2] = trailing digits
		n, _ := strconv.Atoi(m[2])
		newNum := strconv.Itoa(n + 1)
		// Preserve leading zeros
		for len(newNum) < len(m[2]) {
			newNum = "0" + newNum
		}
		return m[1] + newNum
	}

	// no trailing number → append 1
	return name + "1"
}

var (
	// e.g. "room name (#2)" matches "room name" and "2"
	roomNameRegExp = regexp.MustCompile(`^(.*) \(#(\d+)\)$`)
)

// commandTableRestart is sent when the user is in a shared replay of a game and wants to
// start a new game with the same settings as the current game
//
// Example data:
//
//	{
//	  tableID: 15103,
//	  hidePregame: true,
//	}
func commandTableRestart(ctx context.Context, s *Session, d *CommandData) {
	t, exists := getTableAndLock(ctx, s, d.TableID, !d.NoTableLock, !d.NoTablesLock)
	if !exists {
		return
	}
	tableLocked := !d.NoTableLock
	if !d.NoTableLock {
		defer func() {
			if tableLocked {
				t.Unlock(ctx)
			}
		}()
	}

	for {
		restartData, valid := validateAndSnapshotTableRestart(s, d, t)
		if !valid {
			return
		}

		if d.NoTableLock || d.NoTablesLock {
			logger.Error("commandTableRestart was called without pre-fetched data while the caller held table locks.")
			s.Error(DefaultErrorMsg)
			return
		}

		t.Unlock(ctx)
		tableLocked = false

		precomputedSeed, databaseID, creatorPregameStats, success := preFetchTableRestartData(s, restartData)
		if !success {
			return
		}

		reloadedTable, tableExists := getTableAndLock(ctx, s, d.TableID, true, !d.NoTablesLock)
		if !tableExists {
			return
		}
		t = reloadedTable
		tableLocked = true

		currentData, stillValid := validateAndSnapshotTableRestart(s, d, t)
		if !stillValid {
			return
		}

		if restartData.hasSameDatabaseInputs(currentData) {
			tableRestart(
				ctx,
				s,
				d,
				t,
				currentData.playerSessions,
				currentData.spectatorSessions,
				currentData.spectatorShadowingUserID,
				precomputedSeed,
				databaseID,
				creatorPregameStats,
			)
			return
		}

	}
}

type tableRestartData struct {
	playerSessions           []*Session
	spectatorSessions        []*Session
	spectatorShadowingUserID []int
	players                  []*Player
	variantName              string
	precomputeSeed           bool
	reserveGameID            bool
}

func validateAndSnapshotTableRestart(
	s *Session,
	d *CommandData,
	t *Table,
) (*tableRestartData, bool) {
	// Validate that this is a shared replay
	if !t.Replay || !t.Visible {
		s.Warning("Table " + strconv.FormatUint(t.ID, 10) + " is not a shared replay, " +
			"so you cannot send a restart action.")
		return nil, false
	}

	// Validate that this person is spectating the shared replay
	if !t.IsActivelySpectating(s.UserID) {
		s.Warning("You are not in shared replay " + strconv.FormatUint(t.ID, 10) + ".")
		return nil, false
	}

	// Validate that this person is leading the shared replay
	if s.UserID != t.OwnerID {
		s.Warning("You cannot restart a game unless you are the leader.")
		return nil, false
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
		return nil, false
	}

	// Validate that there are at least two people in the shared replay
	if len(t.ActiveSpectators()) < 2 {
		s.Warning("You cannot restart a game unless there are at least two people in it.")
		return nil, false
	}

	// Validate that all of the players who played the game are currently spectating
	// the shared replay
	playerSessions := make([]*Session, 0)
	spectatorSessions := make([]*Session, 0)
	spectatorShadowingUserID := make([]int, 0)
	for _, sp := range t.ActiveSpectators() {
		if sp.Session == nil {
			// A spectator's session should never be nil
			// Assume that someone is in the process of reconnecting
			s.Warning("One of the spectators is currently reconnecting. " +
				"Please try restarting again in a few seconds.")
			return nil, false
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
			shadowingUserID := -1
			if sp.ShadowingPlayerIndex != -1 {
				shadowingUserID = t.Players[sp.ShadowingPlayerIndex].UserID
			}
			spectatorShadowingUserID = append(spectatorShadowingUserID, shadowingUserID)
		}
	}
	if len(playerSessions) != len(t.Players) && d.HidePregame {
		s.Warning("Not all of the players from the original game are in the shared replay, " +
			"so you cannot restart the game.")
		return nil, false
	}

	// Validate that this is not a game with a custom !replay prefix
	if strings.HasPrefix(t.InitialName, "!replay") {
		s.Warning("You are not allowed to restart \"!replay\" games.")
		return nil, false
	}

	// Validate that the server is not about to go offline
	if checkImminentShutdown(s) {
		return nil, false
	}

	// Validate that the server is not undergoing maintenance
	if maintenanceMode.IsSet() {
		s.Warning("The server is undergoing maintenance. " +
			"You cannot start any new games for the time being.")
		return nil, false
	}

	players := make([]*Player, len(t.Players))
	copy(players, t.Players)

	return &tableRestartData{
		playerSessions:           playerSessions,
		spectatorSessions:        spectatorSessions,
		spectatorShadowingUserID: spectatorShadowingUserID,
		players:                  players,
		variantName:              t.Options.VariantName,
		precomputeSeed:           d.HidePregame && !strings.HasPrefix(t.InitialName, "!seed"),
		reserveGameID:            d.HidePregame,
	}, true
}

func (d *tableRestartData) hasSameDatabaseInputs(other *tableRestartData) bool {
	if d.variantName != other.variantName ||
		d.precomputeSeed != other.precomputeSeed ||
		d.reserveGameID != other.reserveGameID ||
		len(d.players) != len(other.players) {
		return false
	}
	for i, player := range d.players {
		if player.UserID != other.players[i].UserID {
			return false
		}
	}
	return true
}

func preFetchTableRestartData(
	s *Session,
	restartData *tableRestartData,
) (string, int, *PregameStats, bool) {
	var databaseID int
	if restartData.reserveGameID {
		id, err := models.Games.ReserveID()
		if err != nil {
			logger.Error("Failed to reserve a game ID for table restart: " + err.Error())
			s.Error(StartGameFail)
			return "", 0, nil, false
		}
		databaseID = id
	}
	var precomputedSeed string
	if restartData.precomputeSeed {
		variant := variants[restartData.variantName]
		seedPrefix := "p" + strconv.Itoa(len(restartData.players)) +
			"v" + strconv.Itoa(variant.ID) +
			"s"
		if seed, err := getNextAvailableSeed(restartData.players, seedPrefix); err != nil {
			logger.Error("Failed to pre-compute seed for table restart: " + err.Error())
			s.Error(StartGameFail)
			return "", 0, nil, false
		} else {
			precomputedSeed = seed
		}
	}

	// Pre-fetch the creator's pregame stats for when they join the new table via
	// commandTableCreate → tableCreate → commandTableJoin → tableJoin.
	variant := variants[restartData.variantName]
	var creatorNumGames int
	if v, err := models.Games.GetUserNumGames(s.UserID, false); err != nil {
		logger.Error("Failed to pre-fetch game count for \"" + s.Username + "\": " + err.Error())
		s.Error(StartGameFail)
		return "", 0, nil, false
	} else {
		creatorNumGames = v
	}
	var creatorVariantStats *UserStatsRow
	if v, err := models.UserStats.Get(s.UserID, variant.ID); err != nil {
		logger.Error("Failed to pre-fetch variant stats for \"" + s.Username + "\": " + err.Error())
		s.Error(StartGameFail)
		return "", 0, nil, false
	} else {
		creatorVariantStats = v
	}
	creatorPregameStats := &PregameStats{NumGames: creatorNumGames, Variant: creatorVariantStats}

	return precomputedSeed, databaseID, creatorPregameStats, true
}

func tableRestart(
	ctx context.Context,
	s *Session,
	d *CommandData,
	t *Table,
	playerSessions []*Session,
	spectatorSessions []*Session,
	spectatorShadowingUserID []int,
	precomputedSeed string,
	databaseID int,
	creatorPregameStats *PregameStats,
) {
	// Since this is a function that changes a user's relationship to tables,
	// we must acquire the tables lock to prevent race conditions
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
	} else if strings.HasPrefix(t.InitialName, "!seed") {
		// If players are in a !seed game, table name increment logic is different:
		// look for trailing digits and bump them, or append "1"
		newTableName = incrementSeedName(t.InitialName)
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

	// If passwordHash was nonempty, preserve old value
	passwordHash := ""
	if t.PasswordHash != "" {
		passwordHash = t.PasswordHash
	}

	// The shared replay should now be deleted, since all of the players have left
	// Now, create the new game but hide it from the lobby.
	// Pass creatorPregameStats so that commandTableCreate skips its own DB pre-fetch and
	// tableJoin uses these stats directly, avoiding any DB calls while locks are held.
	commandTableCreate(ctx, s, &CommandData{ // nolint: exhaustivestruct
		Name:    newTableName,
		Options: t.Options,
		// If pregame option is false, then
		// we want to prevent the pre-game from showing up in the lobby for a brief second
		HidePregame:    d.HidePregame,
		NoTablesLock:   true,
		MaxPlayers:     t.MaxPlayers,
		PasswordHash:   passwordHash,
		BypassPassword: true,
		PregameStats:   creatorPregameStats,
	})

	// Find the newly created table by name.
	// We intentionally do not acquire the per-table lock here. Doing so would create a lock
	// ordering violation: other code (e.g. getTableIDFromName) acquires a table lock without
	// holding tables.Lock, so locking a table while holding tables.Lock (write) can deadlock.
	// It is safe to read existingTable.Name without the per-table lock because we already hold
	// tables.Lock as a write lock, which blocks every goroutine that could mutate a table name
	// (all such mutations go through getTableAndLock, which requires tables.RLock to proceed).
	tableList := tables.GetList(false)
	var t2 *Table
	for _, existingTable := range tableList {
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

	t2.Lock(ctx)
	defer t2.Unlock(ctx)

	// Store the pre-computed seed so that tableStart uses it instead of querying the DB
	// while all three locks (t, tables, t2) are held.
	if precomputedSeed != "" {
		t2.ExtraOptions.PrecomputedSeed = precomputedSeed
	}
	t2.reservedGameID = databaseID

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

	// Send the creator of the game the chat history
	s.NotifyTableJoined(t2)
	chatSendPastFromTable(s, t2)
	t2.ChatRead[s.UserID] = len(t2.Chat)

	// Emulate the other players joining the game.
	// Reuse each player's existing PregameStats from the original table so that tableJoin
	// skips its DB calls, which would block while tables.Lock, t.Lock, and t2.Lock are held.
	for _, s2 := range playerSessions {
		if s2.UserID == s.UserID {
			// The creator of the game does not need to join
			continue
		}
		var existingStats *PregameStats
		for _, p := range t.Players {
			if p.UserID == s2.UserID {
				existingStats = p.Stats
				break
			}
		}
		commandTableJoin(ctx, s2, &CommandData{ // nolint: exhaustivestruct
			TableID:        t2.ID,
			NoTableLock:    true,
			NoTablesLock:   true,
			BypassPassword: true,
			PregameStats:   existingStats,
		})
	}

	// Automatically join any other spectators that were watching
	for idx, s2 := range spectatorSessions {
		shadowingPlayerIndex := -1
		if spectatorShadowingUserID[idx] != -1 {
			shadowingPlayerIndex = t2.GetPlayerIndexFromID(spectatorShadowingUserID[idx])
		}
		commandTableSpectate(ctx, s2, &CommandData{ // nolint: exhaustivestruct
			TableID:              t2.ID,
			ShadowingPlayerIndex: shadowingPlayerIndex,
			NoTableLock:          true,
			NoTablesLock:         true,
		})
	}

	if d.HidePregame {
		// Emulate the game owner clicking on the "Start Game" button
		commandTableStart(ctx, s, &CommandData{ // nolint: exhaustivestruct
			TableID:      t2.ID,
			NoTableLock:  true,
			NoTablesLock: true,
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
