package main

import (
	"context"
	"errors"
	"strconv"
	"time"
)

func (g *Game) End(ctx context.Context, d *CommandData) {
	// Local variables
	t := g.Table

	g.DatetimeFinished = time.Now()
	if g.EndCondition > EndConditionNormal {
		g.Score = 0
	}
	logger.Info(t.GetName() + "Ended with a score of " + strconv.Itoa(g.Score) + ".")

	// There will be no times associated with a replay, so don't bother with the rest of the code
	if g.ExtraOptions.NoWriteToDatabase {
		return
	}

	// Send text messages showing how much time each player finished with
	// and the duration of the game
	// JavaScript expects time in milliseconds
	playerTimes := make([]int64, 0)
	for _, p := range g.Players {
		milliseconds := int64(p.Time / time.Millisecond)
		playerTimes = append(playerTimes, milliseconds)
	}
	duration := int64(g.DatetimeFinished.Sub(g.DatetimeStarted) / time.Millisecond)
	g.Actions = append(g.Actions, ActionPlayerTimes{
		Type:        "playerTimes",
		PlayerTimes: playerTimes,
		Duration:    duration,
	})
	t.NotifyGameAction()

	// Notify everyone that the table was deleted
	// (we will send a new table message later for the shared replay)
	notifyAllTableGone(t)

	// Reset the player's current game and status
	// (this is needed in case the game ends due to idleness;
	// they will be manually set to having a "Shared Replay" status later
	// after the game is converted)
	for _, p := range t.Players {
		if p.Session != nil {
			p.Session.SetStatus(StatusLobby)
			p.Session.SetTableID(uint64(0))
			notifyAllUser(p.Session)
		}
	}

	// Record the game in the database
	if err := g.WriteDatabase(); err != nil {
		return
	}

	// Send a "gameHistory" message to all the players in the game
	var numGamesOnThisSeed int
	if v, err := models.Seeds.GetNumGames(g.Seed); err != nil {
		logger.Error("Failed to get the number of games on seed " + g.Seed + ": " + err.Error())
		return
	} else {
		numGamesOnThisSeed = v
	}
	playerNames := make([]string, 0)
	for _, p := range t.Players {
		playerNames = append(playerNames, p.Name)
	}
	sortStringsCaseInsensitive(playerNames)
	gameHistoryList := make([]*GameHistory, 0)
	gameHistoryList = append(gameHistoryList, &GameHistory{
		// The ID is recorded in the "WriteDatabase()" function above
		ID:                 g.ExtraOptions.DatabaseID,
		Options:            g.Options,
		Seed:               g.Seed,
		Score:              g.Score,
		NumTurns:           g.Turn,
		EndCondition:       g.EndCondition,
		DatetimeStarted:    g.DatetimeStarted,
		DatetimeFinished:   g.DatetimeFinished,
		NumGamesOnThisSeed: numGamesOnThisSeed,
		PlayerNames:        playerNames,
		IncrementNumGames:  true,
		Tags:               "", // Tags are written to the database at a later step
	})
	for _, p := range t.Players {
		p.Session.Emit("gameHistory", &gameHistoryList)
	}

	// Also send the history to the reverse friends
	for _, s := range t.GetNotifySessions(true) {
		s.Emit("gameHistoryFriends", &gameHistoryList)
	}

	// All games are automatically converted to shared replays after they finish
	// (unless all the players are in the lobby / disconnected, or if the game ended to idleness)
	t.ConvertToSharedReplay(ctx, d)
}

func (g *Game) WriteDatabase() error {
	t := g.Table

	row := GameRow{
		Name:             t.Name,
		Options:          g.Options,
		Seed:             g.Seed,
		Score:            g.Score,
		NumTurns:         g.Turn,
		EndCondition:     g.EndCondition,
		DatetimeStarted:  g.DatetimeStarted,
		DatetimeFinished: g.DatetimeFinished,
	}
	if v, err := models.Games.Insert(row); err != nil {
		logger.Error("Failed to insert the game row: " + err.Error())
		return err
	} else {
		t.ExtraOptions.DatabaseID = v
	}

	// Next, we insert rows for each of the participants
	gameParticipantsRows := make([]*GameParticipantsRow, 0)
	for _, gp := range g.Players {
		p := t.Players[gp.Index]

		characterID := 0
		characterMetadata := 0
		if t.Options.DetrimentalCharacters {
			if gp.Character == "n/a" {
				characterID = -1
			} else {
				if v, ok := characters[gp.Character]; !ok {
					logger.Error("Failed to find the ID for character \"" + gp.Character + "\" " +
						"when ending the game.")
					return errors.New("the character of " + gp.Character +
						" does not exist in the characters map")
				} else {
					characterID = v.ID

					// -1 is considered to be "null" metadata
					// Since most characters have null metadata,
					// we save space in the database by storing -1 as 0
					// However, if some characters have a metadata of 0, it is meaningful
					// (e.g. corresponding to the 0th suit)
					// Thus, we store meaningful metadata in the database as 1 + the value to make
					// it clear that it is not a null value
					if v.WriteMetadataToDatabase {
						characterMetadata = gp.CharacterMetadata + 1
					}
				}
			}
		}

		gameParticipantsRows = append(gameParticipantsRows, &GameParticipantsRow{
			GameID:              t.ExtraOptions.DatabaseID,
			UserID:              p.UserID,
			Seat:                gp.Index,
			CharacterAssignment: characterID,
			CharacterMetadata:   characterMetadata,
		})
	}
	if err := models.GameParticipants.BulkInsert(gameParticipantsRows); err != nil {
		logger.Error("Failed to insert the game participant rows: " + err.Error())
		return err
	}

	// Next, we insert rows for each of the actions
	gameActionRows := make([]*GameActionRow, 0)
	for i, action := range g.Actions2 {
		gameActionRows = append(gameActionRows, &GameActionRow{
			GameID: t.ExtraOptions.DatabaseID,
			Turn:   i,
			Type:   action.Type,
			Target: action.Target,
			Value:  action.Value,
		})
	}
	if len(gameActionRows) > 0 {
		if err := models.GameActions.BulkInsert(gameActionRows); err != nil {
			logger.Error("Failed to insert the game action rows: " + err.Error())
			return err
		}
	}

	// Next, we insert rows for each note
	gameParticipantNotesRows := make([]*GameParticipantNotesRow, 0)
	for _, gp := range g.Players {
		p := t.Players[gp.Index]

		for j, note := range gp.Notes {
			if note == "" {
				continue
			}

			gameParticipantNotesRows = append(gameParticipantNotesRows, &GameParticipantNotesRow{
				GameID:    t.ExtraOptions.DatabaseID,
				UserID:    p.UserID,
				CardOrder: j,
				Note:      note,
			})
		}
	}
	if len(gameParticipantNotesRows) > 0 {
		if err := models.GameParticipantNotes.BulkInsert(gameParticipantNotesRows); err != nil {
			logger.Error("Failed to insert the game participants notes rows: " + err.Error())
			// Do not return on failed note insertion,
			// since it should not affect subsequent operations
		}
	}

	// Next, we insert rows for each chat message (if any)
	chatLogRows := make([]*ChatLogRow, 0)
	for _, chatMsg := range t.Chat {
		chatLogRows = append(chatLogRows, &ChatLogRow{
			UserID:  chatMsg.UserID,
			Message: chatMsg.Msg,
			Room:    t.GetRoomName(),
		})
	}
	if len(chatLogRows) > 0 {
		if err := models.ChatLog.BulkInsert(chatLogRows); err != nil {
			logger.Error("Failed to insert the chat message rows: " + err.Error())
			// Do not return on failed chat insertion,
			// since it should not affect subsequent operations
		}
	}

	// Next, we insert rows for each tag (if any)
	gameTagsRows := make([]*GameTagsRow, 0)
	for tag, userID := range g.Tags {
		gameTagsRows = append(gameTagsRows, &GameTagsRow{
			GameID: t.ExtraOptions.DatabaseID,
			UserID: userID,
			Tag:    tag,
		})
	}
	if len(gameTagsRows) > 0 {
		if err := models.GameTags.BulkInsert(gameTagsRows); err != nil {
			logger.Error("Failed to insert the tag rows: " + err.Error())
			// Do not return on failed tag insertion,
			// since it should not affect subsequent operations
		}
	}

	// Finally, we update the seeds table with the number of games played on this seed
	if err := models.Seeds.UpdateNumGames(g.Seed); err != nil {
		logger.Error("Failed to update the number of games in the seeds table: " + err.Error())
		// Do not return on a failed seeds update,
		// since it should not affect subsequent operations
	}

	// We also need to update stats in the database, but that can be done in the background
	go g.WriteDatabaseStats()

	logger.Info("Finished core database actions for table " + strconv.FormatUint(t.ID, 10) +
		" (to database ID " + strconv.Itoa(t.ExtraOptions.DatabaseID) + ").")
	return nil
}

// WriteDatabaseStats is meant to be called in a new goroutine
// Updating the stats is not as important as writing the core data for a game,
// so it can be handled in the background
func (g *Game) WriteDatabaseStats() {
	// Local variables
	t := g.Table
	variant := variants[g.Options.VariantName]
	// 2-player is at index 0, 3-player is at index 1, etc.
	bestScoreIndex := g.Options.NumPlayers - 2

	// Update the variant-specific stats for each player
	modifier := g.Options.GetModifier()
	for _, p := range t.Players {
		// Get their current best scores
		var userStats *UserStatsRow
		if v, err := models.UserStats.Get(p.UserID, variant.ID); err != nil {
			logger.Error("Failed to get the stats for user " + p.Name + ": " + err.Error())
			continue
		} else {
			userStats = v
		}

		thisScore := &BestScore{ // nolint: exhaustivestruct
			NumPlayers: g.Options.NumPlayers,
			Score:      g.Score,
			Modifier:   modifier,
		}
		bestScore := userStats.BestScores[bestScoreIndex]
		if thisScore.IsBetterThan(bestScore) {
			bestScore.Score = g.Score
			bestScore.Modifier = modifier
		}

		// Update their stats
		// (even if they did not get a new best score,
		// we still want to update their average score and strikeout rate)
		if err := models.UserStats.Update(p.UserID, variant.ID, userStats); err != nil {
			logger.Error("Failed to update the stats for user " + p.Name + ": " + err.Error())
			continue
		}
	}

	// Get the current stats for this variant
	var variantStats VariantStatsRow
	if v, err := models.VariantStats.Get(variant.ID); err != nil {
		logger.Error("Failed to get the stats for variant " + strconv.Itoa(variant.ID) + ": " +
			err.Error())
		return
	} else {
		variantStats = v
	}

	// If the game was played with no modifiers, update the stats for this variant
	if modifier == 0 {
		bestScore := variantStats.BestScores[bestScoreIndex]
		if g.Score > bestScore.Score {
			bestScore.Score = g.Score
		}
	}

	// Write the updated stats to the database
	// (even if the game was played with modifiers,
	// we still need to update the number of games played)
	if err := models.VariantStats.Update(variant.ID, variant.MaxScore, variantStats); err != nil {
		logger.Error("Failed to update the stats for variant " + strconv.Itoa(variant.ID) + ": " +
			err.Error())
		return
	}
}

func (t *Table) ConvertToSharedReplay(ctx context.Context, d *CommandData) {
	g := t.Game

	// Since this is a function that changes a user's relationship to tables,
	// we must acquires the tables lock to prevent race conditions
	if !d.NoTablesLock {
		tables.Lock(ctx)
		defer tables.Unlock(ctx)
	}

	t.Replay = true
	t.InitialName = t.Name
	t.Name = "Shared replay for game #" + strconv.Itoa(t.ExtraOptions.DatabaseID)
	// Update the "EndTurn" field (since we incremented the final turn above in an artificial way)
	g.EndTurn = g.Turn
	// Initialize the shared replay on the 2nd to last turn (since the end times are not important)
	g.Turn--
	t.Progress = 100

	// Turn the players into spectators
	ownerOffline := false
	for _, p := range t.Players {
		// Skip offline players and players in the lobby;
		// if they re-login, then they will just stay in the lobby
		if !p.Present {
			if p.UserID == t.OwnerID && (p.Session == nil || p.Session.ms.IsClosed()) {
				// We don't want to pass the replay leader away if they are still in the lobby
				// (as opposed to being offline)
				ownerOffline = true
				logger.Info(p.Name + " was the owner of the game and they are offline; " +
					"passing the leader to someone else.")
			}
			continue
		}

		// If this game was ended due to idleness,
		// skip conversion so that the shared replay gets deleted below
		if g.EndCondition == EndConditionIdleTimeout {
			continue
		}

		// Add the new spectator
		sp := &Spectator{
			UserID:               p.UserID,
			Name:                 p.Name,
			Session:              p.Session,
			Typing:               false,
			LastTyped:            time.Time{},
			ShadowingPlayerIndex: -1, // To indicate that they are not shadowing anyone
			Notes:                make([]string, g.GetNotesSize()),
		}
		t.Spectators = append(t.Spectators, sp)

		// Also, keep track of user to table relationships
		tables.DeletePlaying(p.UserID, t.ID)
		tables.AddSpectating(p.UserID, t.ID)

		logger.Info("Converted " + p.Name + " to a spectator.")
	}

	// End the shared replay if no-one is left
	if len(t.Spectators) == 0 {
		deleteTable(t)
		logger.Info("Ended table #" + strconv.FormatUint(t.ID, 10) +
			" because no-one was present when the game ended.")
		return
	}

	// If the owner of the game is not present, then make someone else the shared replay leader
	if ownerOffline {
		t.OwnerID = -1

		// Default to making the first player the leader,
		// or the second player if the first is away, etc.
		for _, p := range t.Players {
			if p.Present {
				t.OwnerID = p.UserID
				logger.Info("Set the new leader to be: " + p.Name)
				break
			}
		}

		if t.OwnerID == -1 {
			// All of the players are away, so make the first spectator the leader
			t.OwnerID = t.Spectators[0].UserID
			logger.Info("All players are offline; set the new leader to be: " +
				t.Spectators[0].Name)
		}
	}

	// In a shared replay, we don't want any of the player names to be red,
	// because it does not matter if they are present or not
	// So manually make everyone present and then send out an update
	for _, p := range t.Players {
		p.Present = true
	}
	t.NotifyConnected()

	// Give all of the players and spectators the full listing of the cards in the deck
	t.NotifyCardIdentities()

	// Notify everyone that the game is over and that they should prepare the UI for a shared replay
	t.NotifyFinishOngoingGame()

	for _, sp := range t.Spectators {
		// Reset everyone's status (both players and spectators are now spectators)
		if sp.Session != nil {
			sp.Session.SetStatus(StatusSharedReplay)
			sp.Session.SetTableID(t.ID)
			notifyAllUser(sp.Session)
		}

		// Send them the notes from all the players & spectators
		sp.Session.NotifyNoteList(t, -1)
	}

	notifyAllTable(t)    // Update the spectator list for the row in the lobby
	t.NotifySpectators() // Update the in-game spectator list
}
