package main

import (
	"context"
	"strconv"
	"time"

	"github.com/Hanabi-Live/hanabi-live/logger"
)

// commandTableLeave is sent when the user clicks on the "Leave Game" button in the lobby
//
// Example data:
// {
//   tableID: 5,
// }
func commandTableLeave(ctx context.Context, s *Session, d *CommandData) {
	t, exists := getTableAndLock(ctx, s, d.TableID, !d.NoTableLock, !d.NoTablesLock)
	if !exists {
		return
	}
	if !d.NoTableLock {
		defer t.Unlock(ctx)
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

	tableLeave(ctx, s, d, t, playerIndex)
}

func tableLeave(ctx context.Context, s *Session, d *CommandData, t *Table, playerIndex int) {
	// Since this is a function that changes a user's relationship to tables,
	// we must acquires the tables lock to prevent race conditions
	if !d.NoTablesLock {
		tables.Lock(ctx)
		defer tables.Unlock(ctx)
	}

	logger.Info(t.GetName() + "User \"" + s.Username + "\" left. " +
		"(There are now " + strconv.Itoa(len(t.Players)-1) + " players.)")

	t.Players = append(t.Players[:playerIndex], t.Players[playerIndex+1:]...)
	tables.DeletePlaying(s.UserID, t.ID) // Keep track of user to table relationships

	notifyAllTable(t)
	// Announce the departure of the player
	msg := s.Username + " left the game."
	chatServerSend(ctx, msg, t.GetRoomName(), true)
	t.NotifyPlayerChange()

	// Set their status
	s.SetStatus(StatusLobby)
	s.SetTableID(uint64(0))
	notifyAllUser(s)

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
		msg := "Automatic game start has been canceled."
		chatServerSend(ctx, msg, t.GetRoomName(), true)
	}

	// Pass the ownership to the next player
	if s.UserID == t.OwnerID && len(t.Players) > 0 {
		for _, p := range t.Players {
			if p.UserID != s.UserID {
				t.OwnerID = p.UserID
				t.NotifyPlayerChange()
				msg := p.Session.Username + " is the new table owner."
				chatServerSend(ctx, msg, t.GetRoomName(), !d.NoTablesLock)
				break
			}
		}
	}

	// If this is the last person to leave, delete the game
	if len(t.Players) == 0 {
		deleteTable(t)
		logger.Info("Ended pre-game table #" + strconv.FormatUint(t.ID, 10) + " because everyone left.")
		return
	}
}
