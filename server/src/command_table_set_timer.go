package main

import (
	"context"
	"strconv"
)

// commandTableSetTimer is sent when a user types the "/settimer [base] [perTurn]" command
//
// Example data:
// {
//   tableID: 123,
//   options: {
//     timeBase: 120,
//     timePerTurn: 20,
//   },
//
// }
func commandTableSetTimer(ctx context.Context, s *Session, d *CommandData) {
	t, exists := getTableAndLock(ctx, s, d.TableID, !d.NoTableLock, !d.NoTablesLock)
	if !exists {
		return
	}
	if !d.NoTableLock {
		defer t.Unlock(ctx)
	}

	if t.Running {
		s.Warning(StartedFail)
		return
	}

	if s.UserID != t.OwnerID {
		s.Warning(NotOwnerFail)
		return
	}

	// Validate that they sent the options object
	if d.Options == nil {
		d.Options = NewOptions()
	}

	tableSetTimer(ctx, s, d, t)
}

func tableSetTimer(ctx context.Context, s *Session, d *CommandData, t *Table) {
	// Validate that the time values given
	if d.Options.TimeBase <= 0 {
		s.Warning("\"" + strconv.Itoa(d.Options.TimeBase) + "\" is too small of a value for \"Base Time\".")
		return
	}
	if d.Options.TimeBase > 604800 { // 1 week in seconds
		s.Warning("\"" + strconv.Itoa(d.Options.TimeBase) + "\" is too large of a value for \"Base Time\".")
		return
	}
	if d.Options.TimePerTurn <= 0 {
		s.Warning("\"" + strconv.Itoa(d.Options.TimePerTurn) + "\" is too small of a value for \"Time per Turn\".")
		return
	}
	if d.Options.TimePerTurn > 86400 { // 1 day in seconds
		s.Warning("\"" + strconv.Itoa(d.Options.TimePerTurn) + "\" is too large of a value for \"Time per Turn\".")
		return
	}

	// Make it a timed game and set the relevant options
	t.Options.Timed = true
	t.Options.TimeBase = d.Options.TimeBase
	t.Options.TimePerTurn = d.Options.TimePerTurn

	// Even though no-one has joined or left the game, this function will update the display of the
	// variant on the client and refresh all of the variant-specific stats
	t.NotifyPlayerChange()

	// Update the variant in the table list for everyone in the lobby
	notifyAllTable(t)

	msg := s.Username + " has set the game's timer to: " + strconv.Itoa(t.Options.TimeBase) + "\" [Base] and " + strconv.Itoa(t.Options.TimePerTurn) + "\" [Per Turn]"
	chatServerSend(ctx, msg, t.GetRoomName(), d.NoTablesLock)
}
