package commands

/*
// commandTableSpectate is sent when:
// 1) the user clicks on the "Spectate" button in the lobby
// 2) the user creates a solo replay
// 3) the user creates a shared replay
// 4) on behalf of a user when they reconnect after having been in a shared replay
//
// Example data:
// {
//   tableID: 15103,
//   // A value of "-1" must be specified if we do not want to shadow a player
//   shadowingPlayerIndex: -1,
// }
func commandTableSpectate(ctx context.Context, s *Session, d *CommandData) {
	t, exists := getTableAndLock(ctx, s, d.TableID, !d.NoTableLock, !d.NoTablesLock)
	if !exists {
		return
	}
	if !d.NoTableLock {
		defer t.Unlock(ctx)
	}

	// Validate that the game has started
	if !t.Running {
		s.Warning(NotStartedFail)
		return
	}

	// Validate that they are not playing at this table
	if !t.Replay {
		for _, p := range t.Players {
			if p.UserID == s.UserID {
				s.Warning("You cannot spectate a game that you are currently playing.")
				return
			}
		}
	}

	// Validate that they are not already spectating this table
	for _, sp := range t.Spectators {
		if sp.UserID == s.UserID {
			s.Warning("You are already spectating this table.")
			return
		}
	}

	// Validate the shadowing player index
	// (if provided, they want to spectate from a specific player's perspective)
	if d.ShadowingPlayerIndex != -1 {
		if d.ShadowingPlayerIndex < 0 || d.ShadowingPlayerIndex > len(t.Players)-1 {
			s.Warning("That is an invalid player index to shadow.")
			return
		}
	}

	tableSpectate(ctx, s, d, t)
}

func tableSpectate(ctx context.Context, s *Session, d *CommandData, t *Table) {
	// Local variables
	g := t.Game

	// Since this is a function that changes a user's relationship to tables,
	// we must acquires the tables lock to prevent race conditions
	if !d.NoTablesLock {
		tables.Lock(ctx)
		defer tables.Unlock(ctx)
	}

	// Validate that they are not already spectating another table
	if len(tables.GetTablesUserSpectating(s.UserID)) > 0 {
		s.Warningf(
			"You are already spectating a table, so you cannot spectate table: %v",
			t.ID,
		)
		return
	}

	var verb string
	if t.Replay {
		verb = "joined the replay"
	} else {
		verb = "spectated"
	}
	hLog.Infof(
		"%v %v %v.",
		t.GetName(),
		util.PrintUserCapitalized(s.UserID, s.Username),
		verb,
	)

	// They might be reconnecting after a disconnect,
	// so mark that this player is no longer disconnected
	// (this will be a no-op if they were not in the "DisconSpectators" map)
	tables.DeleteDisconSpectating(s.UserID)

	// Add them to the spectators object
	sp := &Spectator{
		UserID:               s.UserID,
		Name:                 s.Username,
		Session:              s,
		Typing:               false,
		LastTyped:            time.Now(),
		ShadowingPlayerIndex: d.ShadowingPlayerIndex,
		Notes:                make([]string, g.GetNotesSize()),
	}

	t.Spectators = append(t.Spectators, sp)
	tables.AddSpectating(s.UserID, t.ID) // Keep track of user to table relationships

	notifyAllTable(t)    // Update the spectator list for the row in the lobby
	t.NotifySpectatorsChanged() // Update the in-game spectator list

	// Set their status
	status := constants.StatusSpectating
	tableID := t.ID
	if t.Replay {
		if t.Visible {
			status = constants.StatusSharedReplay
		} else {
			status = constants.StatusReplay
			tableID = 0 // Protect the privacy of a user in a solo replay
		}
	}
	s.SetStatus(status)
	s.SetTableID(tableID)
	notifyAllUser(s)

	// Send them a "tableStart" message
	// After the client receives the "tableStart" message, they will send a "getGameInfo1" command
	// to begin the process of loading the UI and putting them in the game
	s.NotifyTableStart(t)
}
*/
