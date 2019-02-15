package main

import (
	"encoding/json"
	"strconv"
	"strings"
	"time"

	"github.com/Zamiell/hanabi-live/src/models"
)

func (g *Game) End() {
	g.DatetimeFinished = time.Now()

	// Log the game ending
	loss := false
	if g.EndCondition > endConditionNormal {
		loss = true
		g.Score = 0
	}
	log.Info(g.GetName() + "Ended with a score of " + strconv.Itoa(g.Score) + ".")

	// Advance a turn so that we have an extra separator before the finishing times
	g.NotifyTurn()

	// Send the "gameOver" message
	g.Actions = append(g.Actions, ActionGameOver{
		Type:  "gameOver",
		Score: g.Score,
		Loss:  loss,
	})
	g.NotifyAction()

	// Send everyone a clock message with an active value of -1, which
	// will get rid of the timers on the client-side
	g.NotifyTime()

	// Send "reveal" messages to each player about the missing cards in their hand
	for _, p := range g.Players {
		for _, c := range p.Hand {
			type RevealMessage struct {
				Type  string `json:"type"`
				Which *Which `json:"which"`
			}
			p.Session.Emit("notify", &RevealMessage{
				Type: "reveal",
				Which: &Which{
					Suit:  c.Suit,
					Rank:  c.Rank,
					Order: c.Order,
				},
			})
		}
	}

	// Send text messages showing how much time each player finished with
	// (this won't appear initially unless the user clicks back and then forward again)
	for _, p := range g.Players {
		text := p.Name + " "
		if g.Options.Timed {
			text += "had " + durationToString(p.Time) + " left"
		} else {
			// Player times are negative in untimed games
			text += "took " + durationToString(p.Time*-1)
		}
		g.Actions = append(g.Actions, ActionText{
			Type: "text",
			Text: text,
		})
		g.NotifyAction()
		log.Info(g.GetName() + text)
	}

	// Send a text message showing how much time the game took in total
	totalTime := g.DatetimeFinished.Sub(g.DatetimeStarted)
	text := "The total game duration was: " + durationToString(totalTime)
	g.Actions = append(g.Actions, ActionText{
		Type: "text",
		Text: text,
	})
	g.NotifyAction()
	log.Info(g.GetName() + text)

	// Append a final action with a listing of every card in the deck
	// (so that the client will have it for hypotheticals)
	deck := make([]CardSimple, 0)
	for _, c := range g.Deck {
		deck = append(deck, CardSimple{
			Suit: c.Suit,
			Rank: c.Rank,
		})
	}
	g.Actions = append(g.Actions, ActionDeckOrder{
		Type: "deckOrder",
		Deck: deck,
	})
	g.NotifyAction()

	// Notify everyone that the table was deleted
	// (we will send a new table message later for the shared replay)
	notifyAllTableGone(g)

	// Reset the player's current game and status
	// (this is needed in case the game ends due to idleness;
	// they will be manually set to having a "Shared Replay" status later
	// after the game is converted)
	for _, p := range g.Players {
		p.Session.Set("currentGame", -1)
		p.Session.Set("status", statusLobby)
		notifyAllUser(p.Session)
	}

	// Record the game in the database
	var databaseID int
	if v, err := g.WriteDatabase(); err != nil {
		return
	} else {
		databaseID = v
	}

	// Send a "gameHistory" message to all the players in the game
	var numSimilar int
	if v, err := db.Games.GetNumSimilar(g.Seed); err != nil {
		log.Error("Failed to get the number of games on seed "+g.Seed+":", err)
		return
	} else {
		numSimilar = v
	}
	for _, p := range g.Players {
		var otherPlayerNames string
		for _, p2 := range g.Players {
			if p2.Name != p.Name {
				otherPlayerNames += p2.Name + ", "
			}
		}
		otherPlayerNames = strings.TrimSuffix(otherPlayerNames, ", ")

		h := make([]*models.GameHistory, 0)
		h = append(h, &models.GameHistory{
			ID:               databaseID,
			NumPlayers:       len(g.Players),
			NumSimilar:       numSimilar,
			Score:            g.Score,
			DatetimeFinished: g.DatetimeFinished,
			Variant:          g.Options.Variant,
			OtherPlayerNames: otherPlayerNames,
		})
		p.Session.NotifyGameHistory(h, true)
		// The second argument tells the client to increment the total number of games played
	}

	// Send a chat message with the game result and players
	g.AnnounceGameResult(databaseID)

	// All games are automatically converted to shared replays after they finish
	// (unless all the players are in the lobby / disconnected, or if the game ended to idleness)
	g.ConvertToSharedReplay(databaseID)
}

func (g *Game) WriteDatabase() (int, error) {
	row := models.GameRow{
		Name:                 g.Name,
		NumPlayers:           len(g.Players),
		Owner:                g.Owner,
		Variant:              variants[g.Options.Variant].ID,
		Timed:                g.Options.Timed,
		TimeBase:             g.Options.BaseTime,
		TimePerTurn:          g.Options.TimePerTurn,
		Speedrun:             g.Options.Speedrun,
		DeckPlays:            g.Options.DeckPlays,
		EmptyClues:           g.Options.EmptyClues,
		CharacterAssignments: g.Options.CharacterAssignments,
		Seed:                 g.Seed,
		Score:                g.Score,
		EndCondition:         g.EndCondition,
		DatetimeCreated:      g.DatetimeCreated,
		DatetimeStarted:      g.DatetimeStarted,
		NumTurns:             g.Turn,
	}
	var databaseID int
	if v, err := db.Games.Insert(row); err != nil {
		log.Error("Failed to insert the game row:", err)
		return 0, err
	} else {
		databaseID = v
	}

	// Next, we have to insert rows for each of the participants
	for _, p := range g.Players {
		if err := db.GameParticipants.Insert(
			p.ID,
			databaseID,
			p.Notes,
			characters[p.Character].ID,
			p.CharacterMetadata,
		); err != nil {
			log.Error("Failed to insert the game participant row:", err)
			return 0, err
		}
	}

	// Next, we have to insert rows for each of the actions
	for _, a := range g.Actions {
		var aString string
		if v, err := json.Marshal(a); err != nil {
			log.Error("Failed to convert the action to JSON:", err)
			return 0, err
		} else {
			aString = string(v)
		}

		if err := db.GameActions.Insert(databaseID, aString); err != nil {
			log.Error("Failed to insert the action row:", err)
			return 0, err
		}
	}

	// Next, we have to insert rows for each of the chat messages
	room := "game" + strconv.Itoa(databaseID)
	for _, chatMsg := range g.Chat {
		if err := db.ChatLog.Insert(chatMsg.UserID, chatMsg.Msg, room); err != nil {
			log.Error("Failed to insert a chat message into the database:", err)
			return 0, err
		}
	}

	// Update the stats for each player
	for _, p := range g.Players {
		// Get their current best scores
		var stats models.Stats
		if v, err := db.UserStats.Get(p.ID, variants[g.Options.Variant].ID); err != nil {
			log.Error("Failed to get the stats for user "+p.Name+":", err)
			return 0, err
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
		if err := db.UserStats.Update(p.ID, variants[g.Options.Variant].ID, stats); err != nil {
			log.Error("Failed to update the stats for user "+p.Name+":", err)
			return 0, err
		}
	}

	log.Info("Finished database actions for the end of the game.")
	return databaseID, nil
}

func (g *Game) AnnounceGameResult(databaseID int) {
	// Don't announce the results of test games
	if g.Name == "test game" {
		return
	}

	// Make the list of names
	playerList := make([]string, 0)
	for _, p := range g.Players {
		playerList = append(playerList, p.Name)
	}
	msg := "[" + strings.Join(playerList, ", ") + "] "
	msg += "finished a"
	firstLetter := strings.ToLower(g.Options.Variant)[0]
	if firstLetter == 'a' ||
		firstLetter == 'e' ||
		firstLetter == 'i' ||
		firstLetter == 'o' ||
		firstLetter == 'u' {

		msg += "n"
	}
	msg += " " + g.Options.Variant + " "
	msg += "game with a score of " + strconv.Itoa(g.Score) + ". "
	if g.Score == len(g.Stacks)*5 {
		// This is the theoretical perfect score for this variant
		// (assuming that there are 5 points per stack)
		msg += pogChamp + " "
	} else if g.Score == 0 {
		msg += bibleThump + " "
	}
	msg += "(id: " + strconv.Itoa(databaseID) + ", seed: " + g.Seed + ")"

	commandChat(nil, &CommandData{
		Server: true,
		Msg:    msg,
		Room:   "lobby",
		Spam:   true,
		// Speedrun announcements do not get sent to the lobby to avoid spam
		// (they will still go to the #hanabi-live-bot channel though so that it is easy to find the
		// game ID of a perfect game afterward)
		OnlyDiscord: g.Options.Speedrun,
	})
}

func (g *Game) ConvertToSharedReplay(databaseID int) {
	delete(games, g.ID)
	if _, ok := games[databaseID]; ok {
		log.Error("Failed to turn the game into a shared replay since " +
			"there already exists a game with an ID of " + strconv.Itoa(databaseID) + ".")
		return
	}
	g.ID = databaseID
	games[g.ID] = g
	g.SharedReplay = true
	g.Name = "Shared replay for game #" + strconv.Itoa(g.ID)
	// Update the "EndTurn" variable (since we incremented the final turn above in an artificial way)
	g.EndTurn = g.Turn
	g.Progress = 100

	// Get the notes from all of the players
	notes := make([]models.PlayerNote, 0)
	for _, p := range g.Players {
		note := models.PlayerNote{
			ID:    p.ID,
			Name:  p.Name,
			Notes: p.Notes,
		}
		notes = append(notes, note)
	}

	// Turn the players into spectators
	ownerOffline := false
	for _, p := range g.Players {
		// Skip offline players and players in the lobby;
		// if they re-login, then they will just stay in the lobby
		if !p.Present {
			log.Info("Skipped converting " + p.Name + " to a spectator since they are not present.")
			if p.ID == g.Owner && p.Session.IsClosed() {
				// We don't want to pass the replay leader away if they are still in the lobby (as opposed to being offline)
				ownerOffline = true
				log.Info(p.Name + " was the owner of the game and they are offline; passing the leader to someone else.")
			}
			continue
		}

		// If this game was ended due to idleness,
		// skip conversion so that the shared replay gets deleted below
		if time.Since(g.DatetimeLastAction) > idleGameTimeout {
			log.Info("Skipped converting " + p.Name + " to a spectator since the game ended due to idleness.")
			continue
		}

		// Add the new spectator
		sp := &Spectator{
			ID:      p.ID,
			Name:    p.Name,
			Index:   len(g.Spectators),
			Session: p.Session,
		}
		g.Spectators = append(g.Spectators, sp)
		log.Info("Converted " + p.Name + " to a spectator.")
	}

	// End the shared replay if no-one is left
	if len(g.Spectators) == 0 {
		delete(games, g.ID)
		return
	}

	// If the owner of the game is not present, then make someone else the shared replay leader
	if ownerOffline {
		// Default to making the first spectator the shared replay leader
		g.Owner = g.Spectators[0].ID
		log.Info("Set the new leader to be:", g.Spectators[0].Name)
	}

	// In a shared replay, we don't want any of the player names to be red,
	// because it does not matter if they are present or not
	// So manually make everyone present and then send out an update
	for _, p := range g.Players {
		p.Present = true
	}
	g.NotifyConnected()

	for _, sp := range g.Spectators {
		// Reset everyone's status (both players and spectators are now spectators)
		sp.Session.Set("currentGame", g.ID)
		sp.Session.Set("status", statusSharedReplay)
		notifyAllUser(sp.Session)

		// Activate the Replay Leader label
		sp.Session.NotifyReplayLeader(g)

		// Send them the notes from all players
		sp.Session.NotifyAllNotes(notes)
	}

	notifyAllTable(g)    // Update the spectator list for the row in the lobby
	g.NotifySpectators() // Update the in-game spectator list
}
