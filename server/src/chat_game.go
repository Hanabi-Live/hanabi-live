package main

// /pause
func chatPause(s *Session, d *CommandData, t *Table) {
	if t == nil || d.Room == "lobby" {
		chatServerSend(NotInGameFail, "lobby")
		return
	}

	if !t.Running {
		chatServerSend(NotStartedFail, d.Room)
		return
	}

	commandPause(s, &CommandData{ // Manual invocation
		TableID: t.ID,
		Setting: "pause",
		NoLock:  true,
	})
}

// /unpause
func chatUnpause(s *Session, d *CommandData, t *Table) {
	if t == nil || d.Room == "lobby" {
		chatServerSend(NotInGameFail, "lobby")
		return
	}

	if !t.Running {
		chatServerSend(NotStartedFail, d.Room)
		return
	}

	commandPause(s, &CommandData{ // Manual invocation
		TableID: t.ID,
		Setting: "unpause",
		NoLock:  true,
	})
}
