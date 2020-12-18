package commands

/*
// commandTableTerminate is sent when the user clicks the terminate button in the bottom-left-hand
// corner
//
// Example data:
// {
//   tableID: 5,
//   server: true, // True if a server-initiated termination, otherwise omitted
// }
func commandTableTerminate(ctx context.Context, s *Session, d *CommandData) {
	t, exists := getTableAndLock(ctx, s, d.TableID, !d.NoTableLock, !d.NoTablesLock)
	if !exists {
		return
	}
	if !d.NoTableLock {
		defer t.Unlock(ctx)
	}

	// Validate that they are in the game
	playerIndex := t.GetPlayerIndexFromID(s.UserID)
	if playerIndex == -1 {
		s.Warningf("You are not playing at table %v, so you cannot terminate it.", t.ID)
		return
	}

	// Validate that the game has started
	if !t.Running {
		s.Warning("You can not terminate a game that has not started yet.")
		return
	}

	// Validate that it is not a replay
	if t.Replay {
		s.Warning("You can not terminate a replay.")
		return
	}

	terminate(ctx, s, d, t, playerIndex)
}

func terminate(ctx context.Context, s *Session, d *CommandData, t *Table, playerIndex int) {
	commandAction(ctx, s, &CommandData{ // nolint: exhaustivestruct
		TableID:     t.ID,
		Type:        ActionTypeEndGame,
		Target:      playerIndex,
		Value:       EndConditionTerminated,
		NoTableLock: true,
	})
}
*/
