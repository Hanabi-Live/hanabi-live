package commands

import (
	"context"
	"time"
)

// commandLoaded is sent when the user has finished loading the game UI
//
// Example data:
// {
//   tableID: 5,
// }
func commandLoaded(ctx context.Context, s *Session, d *CommandData) {
	t, exists := getTableAndLock(ctx, s, d.TableID, !d.NoTableLock, !d.NoTablesLock)
	if !exists {
		return
	}
	if !d.NoTableLock {
		defer t.Unlock(ctx)
	}
	g := t.Game

	// Validate that the game has started
	if !t.Running {
		s.Warning(NotStartedFail)
		return
	}

	// Validate that they are a player
	playerIndex := t.GetPlayerIndexFromID(s.UserID)
	if playerIndex == -1 {
		// Don't show a warning message,
		// since the client is programmed to also send a "loaded" command
		return
	}

	// Set their "present" variable back to true,
	// which will turn their name from red to black
	t.Players[playerIndex].Present = true
	t.NotifyConnected()

	// Start the timer if this is the first player
	if !g.StartedTimer && playerIndex == g.ActivePlayerIndex {
		g.StartedTimer = true
		g.DatetimeTurnBegin = time.Now()

		// Re-send the clock times, which will bump up the active player's clock by however
		// many seconds it took for them to load the UI
		t.NotifyTime()

		// Start the countdown for when the active player runs out of time
		if t.Options.Timed && !t.ExtraOptions.NoWriteToDatabase {
			activePlayer := g.Players[g.ActivePlayerIndex]
			go g.CheckTimer(ctx, activePlayer.Time, g.Turn, g.PauseCount, activePlayer)
		}
	}
}
