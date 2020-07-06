package main

import (
	"errors"
	"strconv"
	"time"
)

func (g *Game) End() {
	// Local variables
	t := g.Table

	g.DatetimeFinished = time.Now()
	if g.EndCondition > EndConditionNormal {
		g.Score = 0
	}
	logger.Info(t.GetName() + "Ended with a score of " + strconv.Itoa(g.Score) + ".")

	// Append a final action with a listing of every card in the deck
	// (so that the client will have it for hypotheticals)
	deck := make([]CardIdentity, 0)
	for _, c := range g.Deck {
		deck = append(deck, CardIdentity{
			SuitIndex: c.SuitIndex,
			Rank:      c.Rank,
		})
	}
	g.Actions = append(g.Actions, ActionDeckOrder{
		Type: "deckOrder",
		Deck: deck,
	})
	t.NotifyGameAction()

	// There will be no times associated with a replay, so don't bother with the rest of the code
	if g.ExtraOptions.Replay {
		return
	}

	// Send text messages showing how much time each player finished with
	// (this won't appear initially unless the user clicks back and then forward again)
	for _, p := range g.Players {
		text := p.Name + " "
		if g.Options.Timed {
			text += "had " + durationToString(p.Time) + " left"
		} else {
			// Player times are negative in untimed games
			text += "took: " + durationToString(p.Time*-1)
		}
		g.Actions = append(g.Actions, ActionText{
			Type: "text",
			Text: text,
		})
		t.NotifyGameAction()
		logger.Info(t.GetName() + text)
	}

	// Send a text message showing how much time the game took in total
	totalTime := g.DatetimeFinished.Sub(g.DatetimeStarted)
	text := "The total game duration was: " + durationToString(totalTime)
	g.Actions = append(g.Actions, ActionText{
		Type: "text",
		Text: text,
	})
	t.NotifyGameAction()
	logger.Info(t.GetName() + text)

	// Advance a turn so that the finishing times are separated from the final action of the game
	g.Turn++
	t.NotifyTurn()

	// Notify everyone that the game is over
	t.NotifyGameOver()

	// Send "reveal" messages to each player about the missing cards in their hand
	for _, gp := range g.Players {
		p := t.Players[gp.Index]
		if p.Present {
			for _, c := range gp.Hand {
				type RevealMessage struct {
					SuitIndex int `json:"suitIndex"`
					Rank      int `json:"rank"`
					Order     int `json:"order"` // The ID of the card (based on its order in the deck)
				}
				p.Session.Emit("reveal", &RevealMessage{
					SuitIndex: c.SuitIndex,
					Rank:      c.Rank,
					Order:     c.Order,
				})
			}
		}
	}

	// Notify everyone that the table was deleted
	// (we will send a new table message later for the shared replay)
	notifyAllTableGone(t)

	// Reset the player's current game and status
	// (this is needed in case the game ends due to idleness;
	// they will be manually set to having a "Shared Replay" status later
	// after the game is converted)
	for _, p := range t.Players {
		if p.Session != nil {
			p.Session.Set("status", StatusLobby)
			notifyAllUser(p.Session)
		}
	}

	// Record the game in the database
	if err := g.WriteDatabase(); err != nil {
		return
	}

	// Send a "gameHistory" message to all the players in the game
	var numGamesOnThisSeed int
	if v, err := models.Games.GetNumGamesOnThisSeed(g.Seed); err != nil {
		logger.Error("Failed to get the number of games on seed "+g.Seed+":", err)
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
		ID:                 g.ID, // Recorded in the "WriteDatabase()" function above
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
	t.ConvertToSharedReplay()
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
		logger.Error("Failed to insert the game row:", err)
		return err
	} else {
		g.ID = v
	}

	// Next, we insert rows for each of the participants
	for i, gp := range g.Players {
		p := t.Players[gp.Index]

		characterID := 0
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
				}
			}
		}

		if err := models.GameParticipants.Insert(
			g.ID,
			p.ID,
			gp.Index,
			characterID,
			gp.CharacterMetadata,
		); err != nil {
			logger.Error("Failed to insert game participant row #"+strconv.Itoa(i)+":", err)
			return err
		}
	}

	// Next, we insert rows for each note
	for i, gp := range g.Players {
		p := t.Players[gp.Index]

		for j, note := range gp.Notes {
			if note == "" {
				continue
			}
			if err := models.GameParticipantNotes.Insert(p.ID, g.ID, j, note); err != nil {
				logger.Error("Failed to insert the row for note #"+strconv.Itoa(j)+
					" for game participant #"+strconv.Itoa(i)+":", err)
				// Do not return on failed note insertion,
				// since it should not affect subsequent operations
			}
		}
	}

	// Next, we insert rows for each of the actions
	for i, action := range g.Actions2 {
		// The index of the action in the slice is equivalent to the turn number that the
		// action happened
		if err := models.GameActions.Insert(g.ID, i, action); err != nil {
			logger.Error("Failed to insert row for action #"+strconv.Itoa(i)+":", err)
			return err
		}
	}

	// If the game ended in a special way, we also need to insert an "game over" action
	var gameOverAction *GameAction
	if g.EndCondition == EndConditionTimeout {
		gameOverAction = &GameAction{
			Type:   ActionTypeGameOver,
			Target: g.EndPlayer,
			Value:  EndConditionTimeout,
		}
	} else if g.EndCondition == EndConditionTerminated {
		gameOverAction = &GameAction{
			Type:   ActionTypeGameOver,
			Target: g.EndPlayer,
			Value:  EndConditionTerminated,
		}
	} else if g.EndCondition == EndConditionIdleTimeout {
		gameOverAction = &GameAction{
			Type:   ActionTypeGameOver,
			Target: 0,
			Value:  EndConditionIdleTimeout,
		}
	}
	if gameOverAction != nil {
		if err := models.GameActions.Insert(g.ID, len(g.Actions2), gameOverAction); err != nil {
			logger.Error("Failed to insert the game over action:", err)
			return err
		}
	}

	// Next, we insert rows for each chat message (if any)
	for _, chatMsg := range t.Chat {
		room := "table" + strconv.Itoa(t.ID)
		if err := models.ChatLog.Insert(chatMsg.UserID, chatMsg.Msg, room); err != nil {
			logger.Error("Failed to insert a chat message into the database:", err)
			// Do not return on failed chat insertion,
			// since it should not affect subsequent operations
		}
	}

	// Next, we insert rows for each tag (if any)
	for tag, userID := range g.Tags {
		if err := models.GameTags.Insert(g.ID, userID, tag); err != nil {
			logger.Error("Failed to insert a tag into the database:", err)
			// Do not return on failed tag insertion,
			// since it should not affect subsequent operations
		}
	}

	// Compute the integer modifier for this game,
	// corresponding to the "ScoreModifier" constants in "constants.go"
	var modifier Bitmask
	if g.Options.DeckPlays {
		modifier.AddFlag(ScoreModifierDeckPlays)
	}
	if g.Options.EmptyClues {
		modifier.AddFlag(ScoreModifierEmptyClues)
	}
	if g.Options.OneExtraCard {
		modifier.AddFlag(ScoreModifierOneExtraCard)
	}
	if g.Options.OneLessCard {
		modifier.AddFlag(ScoreModifierOneLessCard)
	}
	if g.Options.AllOrNothing {
		modifier.AddFlag(ScoreModifierAllOrNothing)
	}

	// Update the variant-specific stats for each player
	for _, p := range t.Players {
		// Get their current best scores
		var userStats UserStatsRow
		if v, err := models.UserStats.Get(p.ID, variants[g.Options.VariantName].ID); err != nil {
			logger.Error("Failed to get the stats for user "+p.Name+":", err)
			continue
		} else {
			userStats = v
		}

		// 2-player is at index 0, 3-player is at index 1, etc.
		bestScore := userStats.BestScores[len(g.Players)-2]
		if g.Score > bestScore.Score ||
			(g.Score == bestScore.Score && modifier < bestScore.Modifier) {

			bestScore.Score = g.Score
			bestScore.Modifier = modifier
		}

		// Update their stats
		// (even if they did not get a new best score,
		// we still want to update their average score and strikeout rate)
		if err := models.UserStats.Update(
			p.ID,
			variants[g.Options.VariantName].ID,
			userStats,
		); err != nil {
			logger.Error("Failed to update the stats for user "+p.Name+":", err)
			continue
		}
	}

	// Get the current stats for this variant
	var variantStats VariantStatsRow
	if v, err := models.VariantStats.Get(variants[g.Options.VariantName].ID); err != nil {
		logger.Error("Failed to get the stats for variant "+
			strconv.Itoa(variants[g.Options.VariantName].ID)+":", err)
		return err
	} else {
		variantStats = v
	}

	// If the game was played with no modifiers, update the stats for this variant
	if modifier == 0 {
		// 2-player is at index 0, 3-player is at index 1, etc.
		bestScore := variantStats.BestScores[len(g.Players)-2]
		if g.Score > bestScore.Score {
			bestScore.Score = g.Score
		}
	}

	// Write the updated stats to the database
	// (even if the game was played with modifiers,
	// we still need to update the number of games played)
	if err := models.VariantStats.Update(
		variants[g.Options.VariantName].ID,
		variants[g.Options.VariantName].MaxScore,
		variantStats,
	); err != nil {
		logger.Error("Failed to update the stats for variant "+
			strconv.Itoa(variants[g.Options.VariantName].ID)+":", err)
		return err
	}

	logger.Info("Finished database actions for game " + strconv.Itoa(t.ID) + ".")
	return nil
}

func (t *Table) ConvertToSharedReplay() {
	g := t.Game

	t.Replay = true
	t.InitialName = t.Name
	t.Name = "Shared replay for game #" + strconv.Itoa(g.ID)
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
			if p.ID == t.Owner && (p.Session == nil || p.Session.IsClosed()) {
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
			ID:      p.ID,
			Name:    p.Name,
			Session: p.Session,
			Notes:   make([]string, g.GetNotesSize()),
		}
		t.Spectators = append(t.Spectators, sp)
		logger.Info("Converted " + p.Name + " to a spectator.")
	}

	// End the shared replay if no-one is left
	if len(t.Spectators) == 0 {
		delete(tables, t.ID)
		return
	}

	// If the owner of the game is not present, then make someone else the shared replay leader
	if ownerOffline {
		t.Owner = -1

		// Default to making the first player the leader,
		// or the second player if the first is away, etc.
		for _, p := range t.Players {
			if p.Present {
				t.Owner = p.ID
				logger.Info("Set the new leader to be:", p.Name)
				break
			}
		}

		if t.Owner != -1 {
			// All of the players are away, so make the first spectator the leader
			t.Owner = t.Spectators[0].ID
			logger.Info("All players are offline; set the new leader to be:", t.Spectators[0].Name)
		}
	}

	// In a shared replay, we don't want any of the player names to be red,
	// because it does not matter if they are present or not
	// So manually make everyone present and then send out an update
	for _, p := range t.Players {
		p.Present = true
	}
	t.NotifyConnected()

	for _, sp := range t.Spectators {
		// Reset everyone's status (both players and spectators are now spectators)
		if sp.Session != nil {
			sp.Session.Set("status", StatusSharedReplay)
			notifyAllUser(sp.Session)
		}

		// Activate the Replay Leader label
		sp.Session.NotifyReplayLeader(t, false)

		// Send them the notes from all the players & spectators
		sp.Session.NotifyNoteList(t)

		// Send them the database ID
		type IDMessage struct {
			TableID int `json:"tableID"`
			ID      int `json:"id"`
		}
		sp.Session.Emit("databaseID", &IDMessage{
			TableID: t.ID,
			ID:      g.ID,
		})
	}

	notifyAllTable(t)    // Update the spectator list for the row in the lobby
	t.NotifySpectators() // Update the in-game spectator list
}
