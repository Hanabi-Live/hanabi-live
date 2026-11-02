package main

import "testing"

func TestScheduledShutdownClearsEveryPregamePlayer(t *testing.T) {
	for _, mode := range []string{"connected", "disconnected"} {
		t.Run(mode, func(t *testing.T) {
			table, ctx := newTimerTestTable(t)
			oldSessions := sessions
			sessions = NewSessions()
			t.Cleanup(func() { sessions = oldSessions })
			table.Running = false
			if mode == "connected" {
				for _, player := range table.Players {
					player.Session = NewFakeSession(player.UserID, player.Name)
				}
			}
			terminateAllUnstartedTables(ctx)
			if !table.Deleted || len(table.Players) != 0 {
				t.Fatalf("pregame retained %d players after scheduled cleanup", len(table.Players))
			}
		})
	}
}
