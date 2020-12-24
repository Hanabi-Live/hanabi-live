package chat

import (
	"context"
	"fmt"
	"strconv"
)

// /s - Automatically start the game as soon as someone joins
func (m *Manager) commandS() {
	automaticStart(ctx, s, d, t, len(t.Players)+1)
}

// /s2 - Automatically start the game as soon as there are 2 players
func (m *Manager) commandS2() {
	automaticStart(ctx, s, d, t, 2)
}

// /s3 - Automatically start the game as soon as there are 3 players
func (m *Manager) commandS3() {
	automaticStart(ctx, s, d, t, 3)
}

// /s4 - Automatically start the game as soon as there are 4 players
func (m *Manager) commandS4() {
	automaticStart(ctx, s, d, t, 4)
}

// /s5 - Automatically start the game as soon as there are 5 players
func (m *Manager) commandS5() {
	automaticStart(ctx, s, d, t, 5)
}

// /s6 - Automatically start the game as soon as there are 6 players
func (m *Manager) commandS6() {
	automaticStart(ctx, s, d, t, 6)
}

func automaticStart(ctx context.Context, s *Session, d *CommandData, t *Table, numPlayers int) {
	if t == nil || d.Room == "lobby" {
		chatServerSend(ctx, NotInGameFail, d.Room, d.NoTablesLock)
		return
	}

	if t.Running {
		chatServerSend(ctx, StartedFail, d.Room, d.NoTablesLock)
		return
	}

	if s.UserID != t.OwnerID {
		chatServerSend(ctx, NotOwnerFail, d.Room, d.NoTablesLock)
		return
	}

	if len(d.Args) > 0 {
		// They specific an argument, so make this take priority
		if v, err := strconv.Atoi(d.Args[0]); err != nil {
			msg := fmt.Sprintf("\"%v\" is not an integer.", d.Args[0])
			chatServerSend(ctx, msg, d.Room, d.NoTablesLock)
			return
		} else {
			numPlayers = v
		}

		if numPlayers < 2 || numPlayers > 6 {
			msg := "You can only start a table with 2 to 6 players."
			chatServerSend(ctx, msg, d.Room, d.NoTablesLock)
			return
		}
	}

	if len(t.Players) == numPlayers {
		commandTableStart(ctx, s, &CommandData{ // nolint: exhaustivestruct
			TableID:     t.ID,
			NoTableLock: true,
		})
	} else {
		t.AutomaticStart = numPlayers
		msg := fmt.Sprintf("The game will start as soon as %v players have joined.", numPlayers)
		chatServerSend(ctx, msg, d.Room, d.NoTablesLock)
	}
}
