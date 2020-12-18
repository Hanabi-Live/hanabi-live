package commands

/*
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
		s.Warningf("You are not at table %v, so you cannot leave it.", t.ID)
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

	hLog.Infof(
		"%v %v left. (There are now %v players.)",
		t.GetName(),
		util.PrintUserCapitalized(s.UserID, s.Username),
		len(t.Players)-1,
	)

	t.Players = append(t.Players[:playerIndex], t.Players[playerIndex+1:]...)
	tables.DeletePlaying(s.UserID, t.ID) // Keep track of user to table relationships

	notifyAllTable(t)
	t.NotifyPlayerChange()

	// Set their status
	s.SetStatus(constants.StatusLobby)
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

	// Force everyone else to leave if it was the owner that left
	if s.UserID == t.OwnerID && len(t.Players) > 0 {
		for len(t.Players) > 0 {
			p := t.Players[0]
			s2 := p.Session
			if s2 == nil {
				// A player's session should never be nil
				// They might be in the process of reconnecting,
				// so make a fake session that will represent them
				s2 = NewFakeSession(p.UserID, p.Name)
				hLog.Info("Created a new fake session.")
			}
			commandTableLeave(ctx, s2, &CommandData{ // nolint: exhaustivestruct
				TableID:      t.ID,
				NoTableLock:  true,
				NoTablesLock: true,
			})
		}
		return
	}

	// If this is the last person to leave, delete the game
	if len(t.Players) == 0 {
		deleteTable(t)
		hLog.Infof("Ended pre-game table %v because everyone left.", t.ID)
		return
	}
}
*/
