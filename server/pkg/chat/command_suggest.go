package chat

import (
	"fmt"
	"strconv"
)

// /suggest
func (m *Manager) commandSuggest() {
	if t == nil || d.Room == "lobby" {
		chatServerSend(ctx, NotInGameFail, "lobby", d.NoTablesLock)
		return
	}

	if !t.Replay {
		chatServerSend(ctx, NotReplayFail, d.Room, d.NoTablesLock)
		return
	}

	// Validate that they only sent one argument
	if len(d.Args) != 1 {
		msg := "The format of the /suggest command is: /suggest [turn]"
		chatServerSend(ctx, msg, d.Room, d.NoTablesLock)
		return
	}

	// Validate that the argument is an integer
	arg := d.Args[0]
	if _, err := strconv.Atoi(arg); err != nil {
		var msg string
		if _, err := strconv.ParseFloat(arg, 64); err != nil {
			msg = fmt.Sprintf("\"%v\" is not an integer.", arg)
		} else {
			msg = "The /suggest command only accepts integers."
		}
		chatServerSend(ctx, msg, d.Room, d.NoTablesLock)
		return
	}

	// The logic for this command is handled client-side
}
