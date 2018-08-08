/*
	Sent when the user clicks on the "Join" button in the lobby
	"data" example:
	{
		gameID: 15103,
	}
*/

package main

import (
	"strconv"
	"time"

	"github.com/Zamiell/hanabi-live/src/models"
)

func commandGameJoin(s *Session, d *CommandData) {
	/*
		Validate
	*/

	// Validate that the game exists
	gameID := d.ID
	var g *Game
	if v, ok := games[gameID]; !ok {
		s.Warning("Game " + strconv.Itoa(gameID) + " does not exist.")
		return
	} else {
		g = v
	}

	// Validate that the player is not already joined to this table
	i := g.GetIndex(s.UserID())
	if i != -1 {
		s.Warning("You have already joined this game.")
		return
	}

	// Validate that the player is not joined to another game
	if s.CurrentGame() != -1 {
		s.Warning("You cannot be in more than one game at a time. (You are already in game #" + strconv.Itoa(s.CurrentGame()) + ".)")
		return
	}

	// Validate that this table does not already have 5 players
	if len(g.Players) >= 5 {
		s.Warning("That game already has 5 players.")
		return
	}

	// Validate that the game is not started yet
	if g.Running {
		s.Warning("That game has already started, so you cannot join it.")
		return
	}

	// Validate that they entered the correct password
	if g.Password != "" && d.Password != g.Password {
		s.Warning("That is not the correct password for this game.")
		return
	}

	/*
		Join
	*/

	log.Info(g.GetName() + "User \"" + s.Username() + "\" joined. (There are now " + strconv.Itoa(len(g.Players)+1) + " players.)")

	// Start the idle timeout
	go g.CheckIdle()

	// Get the stats for this player
	var stats models.Stats
	if v, err := db.Users.GetStats(s.UserID(), g.Options.Variant); err != nil {
		log.Error("Failed to get the stats for player \""+s.Username()+"\":", err)
		s.Error("Something went wrong when getting your stats. Please contact an administrator.")
		return
	} else {
		stats = v
	}

	// In non-timed games, start each player with 0 "time left"
	// It will decrement into negative numbers to show how much time they are taking
	timeBase := time.Duration(0)
	if g.Options.Timed {
		numSeconds := g.Options.TimeBase * 60
		timeBase = time.Duration(numSeconds) * time.Second
	}

	p := &Player{
		ID:      s.UserID(),
		Name:    s.Username(),
		Index:   len(g.Players),
		Present: true,
		Stats:   stats,
		Time:    timeBase,
		// Notes will get initialized after the deck is created in "commandGameStart.go"
		Session: s,
	}
	g.Players = append(g.Players, p)
	notifyAllTable(g)
	g.NotifyPlayerChange()

	// Set their status
	s.Set("currentGame", gameID)
	s.Set("status", "Pre-Game")
	notifyAllUser(s)

	// Send them a "joined" message
	// (to let them know they successfully joined the table)
	type JoinedMessage struct {
		GameID int `json:"gameID"`
	}
	s.Emit("joined", &JoinedMessage{
		GameID: gameID,
	})

	// Send the table owner whether or not the "Start Game" button should be greyed out
	g.NotifyTableReady()
}
