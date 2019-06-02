package main

import (
	"encoding/json"
	"strconv"
	"strings"
	"time"

	"github.com/Zamiell/hanabi-live/src/models"
)

func (t *Table) End() {
        opt := t.GameSpec.Options
	t.Game.DatetimeFinished = time.Now()
	if t.Game.EndCondition > endConditionNormal {
		t.Game.Score = 0
	}
	log.Info(t.GetName() + "Ended with a score of " + strconv.Itoa(t.Game.Score) + ".")

	// There will be no times associated with a JSON table, so don't bother with the rest of the code
	if t.NoDatabase {
		return
	}

	// Send text messages showing how much time each player finished with
	// (this won't appear initially unless the user clicks back and then forward again)
	for _, p := range t.GameSpec.Players {
		text := p.Name + " "
		if opt.Timed {
			text += "had " + durationToString(p.Time) + " left"
		} else {
			// Player times are negative in untimed tables
			text += "took: " + durationToString(p.Time*-1)
		}
		t.Game.Actions = append(t.Game.Actions, ActionText{
			Type: "text",
			Text: text,
		})
		t.NotifyAction()
		log.Info(t.GetName() + text)
	}

	// Send a text message showing how much time the table took in total
	totalTime := t.Game.DatetimeFinished.Sub(t.Game.DatetimeStarted)
	text := "The total table duration was: " + durationToString(totalTime)
	t.Game.Actions = append(t.Game.Actions, ActionText{
		Type: "text",
		Text: text,
	})
	t.NotifyAction()
	log.Info(t.GetName() + text)

	// In speedruns, send a text message to show how close to the record they got
	if opt.Speedrun &&
		len(t.GameSpec.Players) != 6 && // 6-player tables are not official
		stringInSlice(opt.Variant, officialSpeedrunVariants) {

		seconds := int(totalTime.Seconds())
		fastestTime := fastestTimes[opt.Variant][len(t.GameSpec.Players)]
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
		} else if seconds < fastestTime && t.Game.Score == t.Game.GetPerfectScore() {
			// Update the new fastest time
			fastestTimes[opt.Variant][len(t.GameSpec.Players)] = seconds

			t.Game.Sound = "new_record"
			t.NotifySound()

			diff := fastestTime - seconds
			text = "You beat the best time by " + strconv.Itoa(diff) + " seconds!"
			t.Game.Actions = append(t.Game.Actions, ActionText{
				Type: "text",
				Text: text,
			})
			t.NotifyAction()
			log.Info(t.GetName() + text)

			text = "Congratulations on a new world record!"
		}

		if text != "" {
			t.Game.Actions = append(t.Game.Actions, ActionText{
				Type: "text",
				Text: text,
			})
			t.NotifyAction()
			log.Info(t.GetName() + text)
		}
	}

	// Advance a turn so that the finishing times are separated from the final action of the table
	t.Game.Turn++
	t.NotifyTurn()

	// Append a final action with a listing of every card in the deck
	// (so that the client will have it for hypotheticals)
	deck := make([]CardSimple, 0)
	for _, c := range t.Game.Deck {
		deck = append(deck, CardSimple{
			Suit: c.Suit,
			Rank: c.Rank,
		})
	}
	t.Game.Actions = append(t.Game.Actions, ActionDeckOrder{
		Type: "deckOrder",
		Deck: deck,
	})
	t.NotifyAction()

	// Notify everyone that the table is over
	t.NotifyTableOver()

	// Send "reveal" messages to each player about the missing cards in their hand
	for _, p := range t.GameSpec.Players {
		for _, c := range p.Hand {
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

	// Notify everyone that the table was deleted
	// (we will send a new table message later for the shared replay)
	notifyAllTableGone(t)

	// Reset the player's current table and status
	// (this is needed in case the table ends due to idleness;
	// they will be manually set to having a "Shared Replay" status later
	// after the table is converted)
	for _, p := range t.GameSpec.Players {
		p.Session.Set("currentTable", -1)
		p.Session.Set("status", statusLobby)
		notifyAllUser(p.Session)
	}

	// Record the table in the database
	if err := t.WriteDatabase(); err != nil {
		return
	}

	// Send a "gameHistory" message to all the players in the table
	var numSimilar int
	if v, err := db.Games.GetNumSimilar(t.GameSpec.Seed); err != nil {
		log.Error("Failed to get the number of tables on seed "+t.GameSpec.Seed+":", err)
		return
	} else {
		numSimilar = v
	}
	for _, p := range t.GameSpec.Players {
		var otherPlayerNames string
		for _, p2 := range t.GameSpec.Players {
			if p2.Name != p.Name {
				otherPlayerNames += p2.Name + ", "
			}
		}
		otherPlayerNames = strings.TrimSuffix(otherPlayerNames, ", ")

		h := make([]*models.GameHistory, 0)
		h = append(h, &models.GameHistory{
			ID:               t.Game.ID,
			NumPlayers:       len(t.GameSpec.Players),
			NumSimilar:       numSimilar,
			Score:            t.Game.Score,
			DatetimeFinished: t.Game.DatetimeFinished,
			Variant:          opt.Variant,
			OtherPlayerNames: otherPlayerNames,
		})
		p.Session.NotifyTableHistory(h, true)
		// The second argument tells the client to increment the total number of tables played
	}

	// Send a chat message with the table result and players
	t.AnnounceTableResult()

	// All tables are automatically converted to shared replays after they finish
	// (unless all the players are in the lobby / disconnected, or if the table ended to idleness)
	t.ConvertToSharedReplay()
}

func (t *Table) WriteDatabase() error {
        g := t.Game
        gs := t.GameSpec
        opt := gs.Options
	row := models.GameRow{
		Name:                 t.Name,
		NumPlayers:           len(t.GameSpec.Players),
		Owner:                t.Owner,
		Variant:              variants[opt.Variant].ID,
		Timed:                opt.Timed,
		TimeBase:             opt.BaseTime,
		TimePerTurn:          opt.TimePerTurn,
		Speedrun:             opt.Speedrun,
		DeckPlays:            opt.DeckPlays,
		EmptyClues:           opt.EmptyClues,
		CharacterAssignments: opt.CharacterAssignments,
		Seed:                 gs.Seed,
		Score:                g.Score,
		NumTurns:             g.Turn,
		EndCondition:         g.EndCondition,
		DatetimeCreated:      t.DatetimeCreated,
		DatetimeStarted:      g.DatetimeStarted,
		DatetimeFinished:     g.DatetimeFinished,
	}
	if v, err := db.Games.Insert(row); err != nil {
		log.Error("Failed to insert the table row:", err)
		return err
	} else {
		t.Game.ID = v
	}

	// Next, we have to insert rows for each of the participants
	for _, p := range t.GameSpec.Players {
		if err := db.GameParticipants.Insert(
			p.ID,
			g.ID,
			p.Notes,
			characters[p.Character].ID,
			p.CharacterMetadata,
		); err != nil {
			log.Error("Failed to insert the table participant row:", err)
			return err
		}
	}

	// Next, we have to insert rows for each of the actions
	for _, a := range g.Actions {
		var aString string
		if v, err := json.Marshal(a); err != nil {
			log.Error("Failed to convert the action to JSON:", err)
			return err
		} else {
			aString = string(v)
		}

		if err := db.GameActions.Insert(t.Game.ID, aString); err != nil {
			log.Error("Failed to insert the action row:", err)
			return err
		}
	}

	// Next, we have to insert rows for each of the chat messages
	room := "game" + strconv.Itoa(g.ID)
	for _, chatMsg := range t.Chat {
		if err := db.ChatLog.Insert(chatMsg.UserID, chatMsg.Msg, room); err != nil {
			log.Error("Failed to insert a chat message into the database:", err)
			return err
		}
	}

	// Update the stats for each player
	for _, p := range gs.Players {
		// Get their current best scores
		var stats models.Stats
		if v, err := db.UserStats.Get(p.ID, variants[opt.Variant].ID); err != nil {
			log.Error("Failed to get the stats for user "+p.Name+":", err)
			return err
		} else {
			stats = v
		}

		// Compute the integer modifier for this table
		// 0 if no extra options
		// 1 if deck play
		// 2 if empty clues
		// 3 if both
		modifier := 0
		if opt.DeckPlays {
			modifier++
		}
		if opt.EmptyClues {
			modifier += 2
		}

		// 2-player is at index 0, 3-player is at index 1, etc.
		bestScore := stats.BestScores[len(gs.Players)-2]
		if g.Score > bestScore.Score ||
			(g.Score == bestScore.Score && modifier < bestScore.Modifier) {

			bestScore.Score = g.Score
			bestScore.Modifier = modifier
		}

		// Update their stats
		// (even if they did not get a new best score,
		// we still want to update their average score and strikeout rate)
		if err := db.UserStats.Update(p.ID, variants[opt.Variant].ID, stats); err != nil {
			log.Error("Failed to update the stats for user "+p.Name+":", err)
			return err
		}
	}

	log.Info("Finished database actions for the end of the table.")
	return nil
}

func (t *Table) AnnounceTableResult() {
        opt := t.GameSpec.Options
	// Don't announce the results of test tables
	if t.Name == "test table" {
		return
	}

	// Make the list of names
	playerList := make([]string, 0)
	for _, p := range t.GameSpec.Players {
		playerList = append(playerList, p.Name)
	}
	msg := "[" + strings.Join(playerList, ", ") + "] "
	if t.Game.EndCondition == endConditionAbandoned {
		msg += "abandoned"
	} else {
		msg += "finished"
	}
	msg += " a"
	firstLetter := strings.ToLower(opt.Variant)[0]
	if firstLetter == 'a' ||
		firstLetter == 'e' ||
		firstLetter == 'i' ||
		firstLetter == 'o' ||
		firstLetter == 'u' {

		msg += "n"
	}
	msg += " " + opt.Variant + " table"
	if t.Game.EndCondition == endConditionAbandoned {
		msg += ". "
	} else {
		msg += " with a score of " + strconv.Itoa(t.Game.Score) + ". "
		if t.Game.Score == t.Game.GetPerfectScore() {
			msg += pogChamp + " "
		} else if t.Game.Score == 0 {
			msg += bibleThump + " "
		}
	}
	msg += "(id: " + strconv.Itoa(t.Game.ID) + ", seed: " + t.GameSpec.Seed + ")"

	commandChat(nil, &CommandData{
		Server: true,
		Msg:    msg,
		Room:   "lobby",
		// Speedrun announcements do not get sent to the lobby to avoid spam
		// (they will still go to the #hanabi-live-bot channel though so that it is easy to find the
		// table ID of a perfect table afterward)
		Spam:        true,
		OnlyDiscord: opt.Speedrun,
	})
}

func (t *Table) ConvertToSharedReplay() {
        g := t.Game
	if t.GameSpec.Options.Correspondence {
		t.Visible = true
	}
	g.Replay = true
	t.Name = "Shared replay for table #" + strconv.Itoa(t.Game.ID)
	// Update the "EndTurn" variable
	// (since we incremented the final turn above in an artificial way)
	g.EndTurn = t.Game.Turn
	g.Progress = 100

	// Turn the players into spectators
	ownerOffline := false
	for _, p := range t.GameSpec.Players {
		// Skip offline players and players in the lobby;
		// if they re-login, then they will just stay in the lobby
		if !p.Present {
			log.Info("Skipped converting " + p.Name + " to a spectator since they are not present.")
			if p.ID == t.Owner && p.Session.IsClosed() {
				// We don't want to pass the replay leader away if they are still in the lobby
				// (as opposed to being offline)
				ownerOffline = true
				log.Info(p.Name + " was the owner of the table and they are offline; " +
					"passing the leader to someone else.")
			}
			continue
		}

		// If this table was ended due to idleness,
		// skip conversion so that the shared replay gets deleted below
		if g.EndCondition == endConditionTimeout {
			log.Info("Skipped converting " + p.Name + " to a spectator " +
				"since the table ended due to idleness.")
			continue
		}

		// Add the new spectator
		sp := &Spectator{
			ID:      p.ID,
			Name:    p.Name,
			Session: p.Session,
			Notes:   make([]string, len(t.Game.Deck)),
		}
		t.Spectators = append(t.Spectators, sp)
		log.Info("Converted " + p.Name + " to a spectator.")
	}

	// End the shared replay if no-one is left
	if len(t.Spectators) == 0 {
		delete(tables, t.ID)
		return
	}

	// If the owner of the table is not present, then make someone else the shared replay leader
	if ownerOffline {
		t.Owner = -1

		// Default to making the first player the leader,
		// or the second player if the first is away, etc.
		for _, p := range t.GameSpec.Players {
			if p.Present {
				t.Owner = p.ID
				log.Info("Set the new leader to be:", p.Name)
				break
			}
		}

		if t.Owner != -1 {
			// All of the players are away, so make the first spectator the leader
			t.Owner = t.Spectators[0].ID
			log.Info("All players are offline; set the new leader to be:", t.Spectators[0].Name)
		}
	}

	// In a shared replay, we don't want any of the player names to be red,
	// because it does not matter if they are present or not
	// So manually make everyone present and then send out an update
	for _, p := range t.GameSpec.Players {
		p.Present = true
	}
	t.NotifyConnected()

	for _, sp := range t.Spectators {
		// Reset everyone's status (both players and spectators are now spectators)
		sp.Session.Set("currentTable", t.ID)
		sp.Session.Set("status", statusSharedReplay)
		notifyAllUser(sp.Session)

		// Activate the Replay Leader label
		sp.Session.NotifyReplayLeader(t)

		// Send them the notes from all the players & spectators
		sp.Session.NotifyNoteList(t)

		// Send them the database ID
		type IDMessage struct {
			ID int `json:"id"`
		}
		sp.Session.Emit("id", &IDMessage{
			ID: g.ID,
		})
	}

	notifyAllTable(t)    // Update the spectator list for the row in the lobby
	t.NotifySpectators() // Update the in-table spectator list
}
