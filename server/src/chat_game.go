package main

/*
// /pause
func chatPause(ctx context.Context, s *Session, d *CommandData, t *Table) {
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

// /unpause
func chatUnpause(ctx context.Context, s *Session, d *CommandData, t *Table, cmd string) {
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
		Setting:     "unpause",
		NoTableLock: true,
	})
}
*/
