package main

import (
	"time"
)

// /pause
func chatPause(s *Session, d *CommandData, t *Table) {
	if d.Room == "lobby" {
		chatServerSend(ChatCommandNotInGameFail, d.Room)
		return
	}

	if !t.Running {
		chatServerSend(ChatCommandNotStartedFail, d.Room)
		return
	}

	commandPause(s, &CommandData{
		TableID: t.ID,
		Setting: "pause",
	})
}

// /unpause
func chatUnpause(s *Session, d *CommandData, t *Table) {
	if d.Room == "lobby" {
		chatServerSend(ChatCommandNotInGameFail, d.Room)
		return
	}

	if !t.Running {
		chatServerSend(ChatCommandNotStartedFail, d.Room)
		return
	}

	commandPause(s, &CommandData{
		TableID: t.ID,
		Setting: "unpause",
	})
}

// /lastmove
func chatLastMove(s *Session, d *CommandData, t *Table) {
	if d.Room == "lobby" {
		chatServerSend(ChatCommandNotInGameFail, d.Room)
		return
	}

	if !t.Running {
		chatServerSend(ChatCommandNotStartedFail, d.Room)
		return
	}

	g := t.Game
	secondsSinceLastMove := time.Since(g.DatetimeTurnBegin)
	durationString := durationToString(secondsSinceLastMove)
	chatServerSend("Time since the last move: "+durationString, d.Room)
}
