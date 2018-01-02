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

	// Send text messages showing how much time each player finished with
	if g.Options.Timed {
		// Advance a turn so that we have an extra separator before the finishing times
		g.Actions = append(g.Actions, Action{
			Type: "turn",
			Num:  g.Turn,
			Who:  g.ActivePlayer,
		})
		// But don't notify the players; the finishing times will only appear in the replay

		for _, p := range g.Players {
			text := p.Name + " finished with a time of " + durationToString(p.Time)
			g.Actions = append(g.Actions, Action{
				Text: text,
			})
			// But don't notify the players; the finishing times will only appear in the replay
			log.Info(g.GetName() + text)
		}
	}

	// Send the "gameOver" message
	loss := false
	if g.EndCondition > 1 {
		loss = true
	}
	g.Actions = append(g.Actions, Action{
		Type:  "gameOver",
		Score: g.Score,
		Loss:  loss,
	})
	g.NotifyAction()

	// Send everyone a clock message with an active value of null, which
	// will get rid of the timers on the client-side
	g.NotifyTime()

	// Send "reveal" messages to each player about the missing cards in their hand
	for _, p := range g.Players {
		for _, c := range p.Hand {
			type RevealMessage struct {
				Which *Which `json:"which"`
			}
			p.Session.Emit("notify", &RevealMessage{
				Which: &Which{
					Rank:  c.Rank,
					Suit:  c.Suit,
					Order: c.Order,
				},
			})
		}
	}

	if g.EndCondition > 1 {
		g.Score = 0
	}

	// Log the game ending
	log.Info(g.GetName() + "Ended with a score of " + strconv.Itoa(g.Score) + ".")

	// Notify everyone that the table was deleted
	notifyAllTableGone(g)

	// Reset the status of the players
	for _, p := range g.Players {
		p.Session.Set("currentGame", -1)
		p.Session.Set("session", "Replay")
		notifyAllUser(p.Session)
	}
	for _, s := range g.Spectators {
		s.Set("currentGame", -1)
		s.Set("session", "Replay")
		notifyAllUser(s)
	}

	// Record the game in the database
	row := models.GameRow{
		Name:            g.Name,
		Owner:           g.Owner,
		Variant:         g.Options.Variant,
		TimeBase:        int(g.Options.TimeBase),
		TimePerTurn:     g.Options.TimePerTurn,
		Seed:            g.Seed,
		Score:           g.Score,
		EndCondition:    g.EndCondition,
		DatetimeCreated: g.DatetimeCreated,
		DatetimeStarted: g.DatetimeStarted,
	}
	var databaseID int
	if v, err := db.Games.Insert(row); err != nil {
		log.Error("Failed to insert the game row:", err)
		return
	} else {
		databaseID = v
	}

	// Next, we have to insert rows for each of the participants
	for _, p := range g.Players {
		if err := db.GameParticipants.Insert(p.ID, databaseID, p.Notes); err != nil {
			log.Error("Failed to insert the game participant row:", err)
			return
		}
	}

	// Next, we have to insert rows for each of the actions
	for _, a := range g.Actions {
		var aString string
		if v, err := json.Marshal(a); err != nil {
			log.Error("Failed to convert the action to JSON:", err)
			return
		} else {
			aString = string(v)
		}

		if err := db.GameActions.Insert(databaseID, aString); err != nil {
			log.Error("Failed to insert the action row:", err)
			return
		}
	}

	var numSimilar int
	if v, err := db.Games.GetNumSimilar(g.Seed); err != nil {
		log.Error("Failed to get the number of games on seed "+g.Seed+":", err)
		return
	} else {
		numSimilar = v
	}

	// Send a "gameHistory" message to all the players in the game
	for _, p := range g.Players {
		var otherPlayerNames string
		for _, p2 := range g.Players {
			if p2.Name != p.Name {
				otherPlayerNames += p2.Name + ", "
			}
		}
		otherPlayerNames = strings.TrimSuffix(otherPlayerNames, ", ")

		h := make([]models.GameHistory, 0)
		h = append(h, models.GameHistory{
			ID:               databaseID,
			NumPlayers:       len(g.Players),
			NumSimilar:       numSimilar,
			Score:            g.Score,
			DatetimeFinished: g.DatetimeFinished,
			Variant:          g.Options.Variant,
			OtherPlayerNames: otherPlayerNames,
		})
		p.Session.NotifyGameHistory(h)
	}

	// Send a chat message with the game result and players
	announceGameResult(g)

	// Keep track of the game ending
	delete(games, g.ID)
	log.Info("Finished database actions for the end of the game.")
}

func announceGameResult(g *Game) {
	// TODO
	/*
		const socket = {
			userID: 1, // The first user ID is reserved for server messages
		};
		const nameList = game.players.map(p => p.username);
		const listEnd = `${game.players.length > 2 ? ',' : ''} and ${nameList.pop()}`;
		const listBeginning = nameList.join(', '); // The final name was removed above
		data.msg = `[${listBeginning}${listEnd}] finished a ${globals.variants[game.variant].toLowerCase()} game with a score of ${game.score}. (#${data.databaseID} - ${game.name})`;
		messages.chat.step1(socket, data);
	*/
}
