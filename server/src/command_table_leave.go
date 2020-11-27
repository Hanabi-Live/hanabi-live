package main

import (
	"strconv"
	"time"
)

// commandTableLeave is sent when the user clicks on the "Leave Game" button in the lobby
//
// Example data:
// {
//   tableID: 5,
// }
func commandTableLeave(s *Session, d *CommandData) {
	t, exists := getTableAndLock(s, d.TableID, !d.NoLock)
	if !exists {
		return
	}
	if !d.NoLock {
		defer t.Mutex.Unlock()
	}

	// Validate that the game has not started
	if t.Running {
		s.Warning("That game has already started, so you cannot leave it.")
		return
	}

	// Validate that it is not a replay
	if t.Replay {
		s.Warning("You can not leave a replay. (You must unattend it.)")
		return
	}

	// Validate that they are at the table
	playerIndex := t.GetPlayerIndexFromID(s.UserID)
	if playerIndex == -1 {
		s.Warning("You are not at table " + strconv.FormatUint(t.ID, 10) + ", " +
			"so you cannot leave it.")
		return
	}

	tableLeave(s, t, playerIndex)
}

func tableLeave(s *Session, t *Table, playerIndex int) {
	logger.Info(t.GetName() + "User \"" + s.Username + "\" left. " +
		"(There are now " + strconv.Itoa(len(t.Players)-1) + " players.)")

	// Remove the player
	t.Players = append(t.Players[:playerIndex], t.Players[playerIndex+1:]...)
	notifyAllTable(t)
	t.NotifyPlayerChange()

	// Set their status
	if s != nil {
		s.SetStatus(StatusLobby)
		s.SetTableID(uint64(0))
		notifyAllUser(s)
	}

	// Make the client switch screens to show the base lobby
	type TableLeftMessage struct {
		TableID uint64
	}
	s.Emit("left", &TableLeftMessage{
		TableID: t.ID,
	})

	// If they were typing, remove the message
	t.NotifyChatTyping(s.Username, false)

	// If there is an automatic start countdown, cancel it
	if !t.DatetimePlannedStart.IsZero() {
		t.DatetimePlannedStart = time.Time{} // Assign a zero value
		chatServerSend("Automatic game start has been canceled.", t.GetRoomName())
	}

	// Force everyone else to leave if it was the owner that left
	if s.UserID == t.Owner && len(t.Players) > 0 {
		for len(t.Players) > 0 {
			p := t.Players[0]
			s2 := p.Session
			if s2 == nil {
				// A player's session should never be nil
				// They might be in the process of reconnecting,
				// so make a fake session that will represent them
				s2 = NewFakeSession(p.ID, p.Name)
				logger.Info("Created a new fake session in the \"commandTableLeave()\" function.")
			}
			commandTableLeave(s2, &CommandData{ // Manual invocation
				TableID: t.ID,
				NoLock:  true,
			})
		}
		return
	}

	// If this is the last person to leave, delete the game
	if len(t.Players) == 0 {
		deleteTable(t)
		logger.Info("Ended pre-game table #" + strconv.FormatUint(t.ID, 10) + " because everyone left.")
		return
	}
}
