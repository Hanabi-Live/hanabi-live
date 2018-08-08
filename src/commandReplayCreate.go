/*
	Sent when the user clicks on the "Watch Replay" button
	(the client will send a "hello" message after getting "gameStart")

	"data" example:
	{
		gameID: 15103,
	}
*/

package main

import (
	"strconv"
)

func commandReplayCreate(s *Session, d *CommandData) {
	gameID := d.ID
	if exists, err := db.Games.Exists(gameID); err != nil {
		log.Error("Failed to check to see if game "+strconv.Itoa(gameID)+" exists:", err)
		s.Error("Failed to initialize the game. Please contact an administrator.")
		return
	} else if !exists {
		s.Warning("Game #" + strconv.Itoa(gameID) + " does not exist in the database.")
		return
	}

	// Set their status
	s.Set("currentGame", gameID)
	s.Set("status", "Replay")
	notifyAllUser(s)

	// Send them a "gameStart" message
	s.NotifyGameStart()
}
