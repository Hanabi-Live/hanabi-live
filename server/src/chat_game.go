package main

import (
	"context"
)

// /pause
func chatPause(ctx context.Context, s *Session, d *CommandData, t *Table) {
	if t == nil || d.Room == "lobby" {
		chatServerSend(ctx, NotInGameFail, "lobby")
		return
	}

	if !t.Running {
		chatServerSend(ctx, NotStartedFail, d.Room)
		return
	}

	commandPause(ctx, s, &CommandData{ // nolint: exhaustivestruct
		TableID: t.ID,
		Setting: "pause",
		NoLock:  true,
	})
}

// /unpause
func chatUnpause(ctx context.Context, s *Session, d *CommandData, t *Table) {
	if t == nil || d.Room == "lobby" {
		chatServerSend(ctx, NotInGameFail, "lobby")
		return
	}

	if !t.Running {
		chatServerSend(ctx, NotStartedFail, d.Room)
		return
	}

	commandPause(ctx, s, &CommandData{ // nolint: exhaustivestruct
		TableID: t.ID,
		Setting: "unpause",
		NoLock:  true,
	})
}
