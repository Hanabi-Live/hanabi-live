package chat

func (m *Manager) commandKick() {
	if t == nil || d.Room == "lobby" {
		chatServerSend(ctx, NotInGameFail, d.Room, d.NoTablesLock)
		return
	}

	if t.Running {
		chatServerSend(ctx, NotStartedFail, d.Room, d.NoTablesLock)
		return
	}

	if s.UserID != t.OwnerID {
		chatServerSend(ctx, NotOwnerFail, d.Room, d.NoTablesLock)
		return
	}

	if len(d.Args) != 1 {
		msg := "The format of the /kick command is: /kick [username]"
		chatServerSend(ctx, msg, d.Room, d.NoTablesLock)
		return
	}

	// Check to make sure that they are not targeting themself
	normalizedUsername := normalizeString(d.Args[0])
	if normalizedUsername == normalizeString(s.Username) {
		msg := "You cannot kick yourself."
		chatServerSend(ctx, msg, d.Room, d.NoTablesLock)
		return
	}

	// Check to see if this person is in the game
	for _, p := range t.Players {
		if normalizedUsername == normalizeString(p.Name) {
			// Record this player's user ID so that they cannot rejoin the table afterward
			t.KickedPlayers[p.UserID] = struct{}{}

			// Get the session
			s2 := p.Session
			if s2 == nil {
				// A player's session should never be nil
				// They might be in the process of reconnecting,
				// so make a fake session that will represent them
				s2 = NewFakeSession(p.UserID, p.Name)
				hLog.Info("Created a new fake session.")
			}

			// Remove them from the table
			commandTableLeave(ctx, s2, &CommandData{ // nolint: exhaustivestruct
				TableID:     t.ID,
				NoTableLock: true,
			})

			msg := fmt.Sprintf("Successfully kicked \"%v\" from the game.", d.Args[0])
			chatServerSend(ctx, msg, d.Room, d.NoTablesLock)
			return
		}
	}

	msg := fmt.Sprintf("\"%v\" is not joined to this game.", d.Args[0])
	chatServerSend(ctx, msg, d.Room, d.NoTablesLock)
}
