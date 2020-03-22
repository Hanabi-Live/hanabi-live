package main

import (
	"encoding/json"
	"strconv"
	"strings"
	"time"
)

func (g *Game) End() {
	t := g.Table

	t.DatetimeFinished = time.Now()
	if g.EndCondition > endConditionNormal {
		g.Score = 0
	}
	logger.Info(t.GetName() + "Ended with a score of " + strconv.Itoa(g.Score) + ".")

	// Append a final action with a listing of every card in the deck
	// (so that the client will have it for hypotheticals)
	deck := make([]SimpleCard, 0)
	for _, c := range g.Deck {
		deck = append(deck, SimpleCard{
			Suit: c.Suit,
			Rank: c.Rank,
		})
	}
	g.Actions = append(g.Actions, ActionDeckOrder{
		Type: "deckOrder",
		Deck: deck,
	})
	t.NotifyAction()

	// There will be no times associated with a JSON game, so don't bother with the rest of the code
	if g.Options.JSONGame {
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
		t.NotifyAction()
		logger.Info(t.GetName() + text)
	}

	// Send a text message showing how much time the game took in total
	totalTime := t.DatetimeFinished.Sub(t.DatetimeStarted)
	text := "The total game duration was: " + durationToString(totalTime)
	g.Actions = append(g.Actions, ActionText{
		Type: "text",
		Text: text,
	})
	t.NotifyAction()
	logger.Info(t.GetName() + text)

	// In speedruns, send a text message to show how close to the record they got
	if g.Options.Speedrun &&
		len(g.Players) != 6 && // 6-player games are not official
		stringInSlice(g.Options.Variant, officialSpeedrunVariants) {

		seconds := int(totalTime.Seconds())
		fastestTime := fastestTimes[g.Options.Variant][len(g.Players)]
		text := ""
		if seconds == fastestTime {
			text = "You tied the world record!"
		} else if seconds > fastestTime {
			// Only bother showing how close the players came
			// if they were within 60 seconds of the world record
			diff := seconds - fastestTime
			if diff <= 60 {
				text = "You were slower than the world record by " +
					strconv.Itoa(diff) + " seconds."
			}
		} else if seconds < fastestTime && g.Score == variants[g.Options.Variant].MaxScore {
			// Update the new fastest time
			fastestTimes[g.Options.Variant][len(g.Players)] = seconds

			g.Sound = "new_record"
			t.NotifySound()

			diff := fastestTime - seconds
			text = "You beat the best time by " + strconv.Itoa(diff) + " seconds!"
			g.Actions = append(g.Actions, ActionText{
				Type: "text",
				Text: text,
			})
			t.NotifyAction()
			logger.Info(t.GetName() + text)

			text = "Congratulations on a new world record!"
		}

		if text != "" {
			g.Actions = append(g.Actions, ActionText{
				Type: "text",
				Text: text,
			})
			t.NotifyAction()
			logger.Info(t.GetName() + text)
		}
	}

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
					Suit  int `json:"suit"`
					Rank  int `json:"rank"`
					Order int `json:"order"` // The ID of the card (based on its order in the deck)
				}
				p.Session.Emit("reveal", &RevealMessage{
					Suit:  c.Suit,
					Rank:  c.Rank,
					Order: c.Order,
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
		p.Session.Set("currentTable", -1)
		p.Session.Set("status", statusLobby)
		notifyAllUser(p.Session)
	}

	// Record the game in the database
	if err := g.WriteDatabase(); err != nil {
		return
	}

	// Send a "gameHistory" message to all the players in the game
	var numSimilar int
	if v, err := models.Games.GetNumSimilar(g.Seed); err != nil {
		logger.Error("Failed to get the number of games on seed "+g.Seed+":", err)
		return
	} else {
		numSimilar = v
	}
	for _, p := range t.Players {
		var otherPlayerNames string
		for _, p2 := range t.Players {
			if p2.Name != p.Name {
				otherPlayerNames += p2.Name + ", "
			}
		}
		otherPlayerNames = strings.TrimSuffix(otherPlayerNames, ", ")

		h := make([]*GameHistory, 0)
		h = append(h, &GameHistory{
			ID:               g.ID, // Recorded in the "WriteDatabase()" function above
			NumPlayers:       len(g.Players),
			NumSimilar:       numSimilar,
			Score:            g.Score,
			DatetimeFinished: t.DatetimeFinished,
			Variant:          g.Options.Variant,
			OtherPlayerNames: otherPlayerNames,
		})
		p.Session.NotifyGameHistory(h, true)
		// The second argument tells the client to increment the total number of games played
	}

	// Send a chat message with the game result and players
	g.AnnounceGameResult()

	// All games are automatically converted to shared replays after they finish
	// (unless all the players are in the lobby / disconnected, or if the game ended to idleness)
	t.ConvertToSharedReplay()
}

func (g *Game) WriteDatabase() error {
	t := g.Table

	row := GameRow{
		Name:                 t.Name,
		NumPlayers:           len(g.Players),
		Owner:                t.Owner,
		Variant:              variants[g.Options.Variant].ID,
		Timed:                g.Options.Timed,
		TimeBase:             g.Options.BaseTime,
		TimePerTurn:          g.Options.TimePerTurn,
		Speedrun:             g.Options.Speedrun,
		CardCycle:            g.Options.CardCycle,
		DeckPlays:            g.Options.DeckPlays,
		EmptyClues:           g.Options.EmptyClues,
		CharacterAssignments: g.Options.CharacterAssignments,
		Seed:                 g.Seed,
		Score:                g.Score,
		NumTurns:             g.Turn,
		EndCondition:         g.EndCondition,
		DatetimeCreated:      t.DatetimeCreated,
		DatetimeStarted:      t.DatetimeStarted,
		DatetimeFinished:     t.DatetimeFinished,
	}
	if v, err := models.Games.Insert(row); err != nil {
		logger.Error("Failed to insert the game row:", err)
		return err
	} else {
		g.ID = v
	}

	// Next, we have to insert rows for each of the participants
	for _, gp := range g.Players {
		p := t.Players[gp.Index]
		if err := models.GameParticipants.Insert(
			p.ID,
			g.ID,
			gp.Index,
			gp.Notes,
			characters[gp.Character].ID,
			gp.CharacterMetadata,
		); err != nil {
			logger.Error("Failed to insert the game participant row:", err)
			return err
		}
	}

	// Next, we have to insert rows for each of the actions
	for _, a := range g.Actions {
		var aString string
		if v, err := json.Marshal(a); err != nil {
			logger.Error("Failed to convert the action to JSON:", err)
			return err
		} else {
			aString = string(v)
		}

		if err := models.GameActions.Insert(g.ID, aString); err != nil {
			logger.Error("Failed to insert the action row:", err)
			return err
		}
	}

	// Next, we have to insert rows for each of the chat messages
	for _, chatMsg := range t.Chat {
		room := "table" + strconv.Itoa(t.ID)
		if err := models.ChatLog.Insert(chatMsg.UserID, chatMsg.Msg, room); err != nil {
			logger.Error("Failed to insert a chat message into the database:", err)
			return err
		}
	}

	// Update the variant-specific stats for each player
	for _, p := range t.Players {
		// Get their current best scores
		var stats UserStatsRow
		if v, err := models.UserStats.Get(p.ID, variants[g.Options.Variant].ID); err != nil {
			logger.Error("Failed to get the stats for user "+p.Name+":", err)
			return err
		} else {
			stats = v
		}

		// Compute the integer modifier for this game
		// 0 if no extra options
		// 1 if deck play
		// 2 if empty clues
		// 3 if both
		modifier := 0
		if g.Options.DeckPlays {
			modifier++
		}
		if g.Options.EmptyClues {
			modifier += 2
		}

		// 2-player is at index 0, 3-player is at index 1, etc.
		bestScore := stats.BestScores[len(g.Players)-2]
		if g.Score > bestScore.Score ||
			(g.Score == bestScore.Score && modifier < bestScore.Modifier) {

			bestScore.Score = g.Score
			bestScore.Modifier = modifier
		}

		// Update their stats
		// (even if they did not get a new best score,
		// we still want to update their average score and strikeout rate)
		if err := models.UserStats.Update(p.ID, variants[g.Options.Variant].ID, stats); err != nil {
			logger.Error("Failed to update the stats for user "+p.Name+":", err)
			return err
		}
	}

	// Get the current stats for this variant
	var stats VariantStatsRow
	if v, err := models.VariantStats.Get(variants[g.Options.Variant].ID); err != nil {
		logger.Error("Failed to get the stats for variant "+
			strconv.Itoa(variants[g.Options.Variant].ID)+":", err)
		return err
	} else {
		stats = v
	}

	// If the game was played with no modifiers, update the stats
	if !g.Options.DeckPlays && !g.Options.EmptyClues {
		// 2-player is at index 0, 3-player is at index 1, etc.
		bestScore := stats.BestScores[len(g.Players)-2]
		if g.Score > bestScore.Score {
			bestScore.Score = g.Score
		}
	}

	// Write the updated stats to the database
	// (even if the game was played with modifiers,
	// we still need to update the number of games played)
	if err := models.VariantStats.Update(
		variants[g.Options.Variant].ID,
		variants[g.Options.Variant].MaxScore,
		stats,
	); err != nil {
		logger.Error("Failed to update the stats for variant "+
			strconv.Itoa(variants[g.Options.Variant].ID)+":", err)
		return err
	}

	logger.Info("Finished database actions for game " + strconv.Itoa(t.ID) + ".")
	return nil
}

func (g *Game) AnnounceGameResult() {
	t := g.Table

	// Don't announce the results of test games
	if t.Name == "test game" {
		return
	}

	// Make the list of names
	playerList := make([]string, 0)
	for _, p := range g.Players {
		playerList = append(playerList, p.Name)
	}
	msg := "[" + strings.Join(playerList, ", ") + "] "
	if g.EndCondition == endConditionAbandoned {
		msg += "abandoned"
	} else {
		msg += "finished"
	}
	msg += " a"
	firstLetter := strings.ToLower(g.Options.Variant)[0]
	if firstLetter == 'a' ||
		firstLetter == 'e' ||
		firstLetter == 'i' ||
		firstLetter == 'o' ||
		firstLetter == 'u' {

		msg += "n"
	}
	msg += " " + g.Options.Variant + " game"
	if g.EndCondition == endConditionAbandoned {
		msg += ". "
	} else {
		msg += " with a score of " + strconv.Itoa(g.Score) + ". "
		if g.Score == variants[g.Options.Variant].MaxScore {
			msg += pogChamp + " "
		} else if g.Score == 0 {
			msg += bibleThump + " "
		}
	}
	msg += "(id: " + strconv.Itoa(g.ID) + ", seed: " + g.Seed + ")"

	commandChat(nil, &CommandData{
		Server: true,
		Msg:    msg,
		Room:   "lobby",
		// Speedrun announcements do not get sent to the lobby to avoid spam
		// (they will still go to the #hanabi-live-bot channel though so that it is easy to find the
		// game ID of a perfect game afterward)
		Spam:        true,
		OnlyDiscord: g.Options.Speedrun,
	})
}

func (t *Table) ConvertToSharedReplay() {
	g := t.Game

	t.Replay = true
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
			logger.Info("Skipped converting " + p.Name + " to a spectator since they are not present.")
			if p.ID == t.Owner && p.Session.IsClosed() {
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
		if g.EndCondition == endConditionTimeout {
			logger.Info("Skipped converting " + p.Name + " to a spectator " +
				"since the game ended due to idleness.")
			continue
		}

		// Add the new spectator
		sp := &Spectator{
			ID:      p.ID,
			Name:    p.Name,
			Session: p.Session,
			// There are notes for every card in the deck + the stack bases for each suit
			Notes: make([]string, len(g.Deck)+len(variants[t.Options.Variant].Suits)),
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
		sp.Session.Set("currentTable", t.ID)
		sp.Session.Set("status", statusSharedReplay)
		notifyAllUser(sp.Session)

		// Activate the Replay Leader label
		sp.Session.NotifyReplayLeader(t, false)

		// Send them the notes from all the players & spectators
		sp.Session.NotifyNoteList(t)

		// Send them the database ID
		type IDMessage struct {
			ID int `json:"id"`
		}
		sp.Session.Emit("databaseID", &IDMessage{
			ID: g.ID,
		})
	}

	notifyAllTable(t)    // Update the spectator list for the row in the lobby
	t.NotifySpectators() // Update the in-game spectator list
}
