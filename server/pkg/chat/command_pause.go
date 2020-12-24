package chat

// /pause
func (m *Manager) commandPause() {
	if t == nil || d.Room == "lobby" {
		chatServerSend(ctx, NotInGameFail, "lobby", d.NoTablesLock)
		return
	}

	if !t.Running {
		chatServerSend(ctx, NotStartedFail, d.Room, d.NoTablesLock)
		return
	}

	commandPause(ctx, s, &CommandData{ // nolint: exhaustivestruct
		TableID:     t.ID,
		Setting:     "pause",
		NoTableLock: true,
	})
}
