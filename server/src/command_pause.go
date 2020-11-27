package main

import (
	"strconv"
	"time"
)

// commandPause is sent when the user pauses or unpauses the game
//
// Example data:
// {
//   tableID: 5,
//   setting: 'pause', // Can also be 'unpause', 'pause-queue', 'pause-unqueue'
//   // ('pause-queue' will automatically pause the game when it gets to their turn)
// }
func commandPause(s *Session, d *CommandData) {
	t, exists := getTableAndLock(s, d.TableID, !d.NoLock)
	if !exists {
		return
	}
	if !d.NoLock {
		defer t.Mutex.Unlock()
	}
	g := t.Game

	// Validate that the game has started
	if !t.Running {
		s.Warning(NotStartedFail)
		return
	}

	// Validate that it is not a replay
	if t.Replay {
		s.Warning("You can not pause or unpause in a replay.")
		return
	}

	// Validate that they are in the game
	playerIndex := t.GetPlayerIndexFromID(s.UserID)
	if playerIndex == -1 {
		s.Warning("You are not at table " + strconv.FormatUint(t.ID, 10) + ", " +
			"so you cannot pause / unpause.")
		return
	}
	p := g.Players[playerIndex]

	// Validate that it is a timed game
	if !t.Options.Timed {
		s.Warning("This is not a timed game, so you cannot pause / unpause.")
		return
	}

	// If a player requests a queued pause on their turn, turn it into a normal pause
	if d.Setting == "pause-queue" && g.ActivePlayerIndex == playerIndex {
		d.Setting = "pause"
	}

	// Validate the setting
	if d.Setting == "pause" {
		if g.Paused {
			s.Warning("The game is already paused.")
			return
		}
	} else if d.Setting == "unpause" {
		if !g.Paused {
			s.Warning("The game is not paused, so you cannot unpause.")
			return
		}
	} else if d.Setting == "pause-queue" {
		if p.RequestedPause {
			s.Warning("You have already requested a pause when it gets to your turn.")
			return
		}
	} else if d.Setting == "pause-unqueue" {
		if !p.RequestedPause {
			s.Warning("You have not requested a pause, so you cannot unqueue one.")
			return
		}
	} else {
		s.Warning("That is not a valid setting.")
		return
	}

	pause(s, d, t, playerIndex)
}

func pause(s *Session, d *CommandData, t *Table, playerIndex int) {
	// Local variables
	g := t.Game
	p := g.Players[playerIndex]

	if d.Setting == "pause-queue" {
		p.RequestedPause = true
		return
	}
	if d.Setting == "pause-unqueue" {
		p.RequestedPause = false
		return
	}

	if d.Setting == "pause" {
		g.Paused = true
		g.PausePlayerIndex = playerIndex
		g.PauseCount++

		// Decrement the time that the player has taken so far prior to this pause
		p.Time -= time.Since(g.DatetimeTurnBegin)
	} else if d.Setting == "unpause" {
		g.Paused = false
		g.PausePlayerIndex = -1

		// Technically, a players turn should not begin when the game is unpaused,
		// but this variable is only used for decrementing time taken at the end of a player's turn
		g.DatetimeTurnBegin = time.Now()

		// Restart the function that will check to see if the current player has run out of time
		// (the old "CheckTimer()" invocation will return and do nothing because the pause count of
		// the game will not match)
		go g.CheckTimer(g.Turn, g.PauseCount, g.Players[g.ActivePlayerIndex])
	}

	t.NotifyPause()

	// Also send a chat message about it
	msg := s.Username + " "
	if !g.Paused {
		msg += "un"
	}
	msg += "paused the game."
	chatServerSend(msg, t.GetRoomName())

	// If a user has read all of the chat thus far,
	// mark that they have also read the "pause" message, since it is superfluous
	for k, v := range t.ChatRead {
		if v == len(t.Chat)-1 {
			t.ChatRead[k] = len(t.Chat)
		}
	}

	// Send everyone new clock values
	if d.Setting == "unpause" {
		t.NotifyTime()
	}
}
