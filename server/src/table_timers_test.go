package main

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func newTimerTestTable(t *testing.T) (*Table, context.Context) {
	t.Helper()
	oldTables, oldGate, oldDev, oldActions := tables, incomingCommands, isDev, actionFunctions
	tables = NewTables()
	incomingCommands = &commandGate{}
	isDev = false
	actionsFunctionsInit()
	table := snapshotTestTable()
	table.OwnerID = 1
	table.Options.Timed = true
	table.Game.StartedTimer = true
	table.Game.DatetimeTurnBegin = time.Now()
	for _, player := range table.Players {
		player.Present = false
	}
	for _, player := range table.Game.Players {
		player.Time = time.Hour
	}
	tables.Set(table.ID, table)
	ctx := NewMiscContext("test")
	t.Cleanup(func() {
		table.Lock(ctx)
		table.cancelIdleTimer()
		table.cancelTurnTimer()
		table.Unlock(ctx)
		tables, incomingCommands, isDev, actionFunctions = oldTables, oldGate, oldDev, oldActions
	})
	return table, ctx
}

func TestTurnTimerRejectsReplacedCallbackInSameTurn(t *testing.T) {
	table, ctx := newTimerTestTable(t)
	g := table.Game
	table.Lock(ctx)
	g.scheduleTurnTimer(ctx)
	oldVersion, turn, pauseCount := table.turnTimerVersion, g.Turn, g.PauseCount
	player := g.Players[g.ActivePlayerIndex]
	g.scheduleTurnTimer(ctx)
	currentVersion := table.turnTimerVersion
	table.turnTimer.Stop()
	g.ExtraOptions.NoWriteToDatabase = true
	table.Unlock(ctx)

	// A second action can extend the timer without advancing the turn number.
	g.expireTurnTimer(ctx, oldVersion, turn, pauseCount, player)
	if g.EndCondition != EndConditionInProgress {
		t.Fatal("an already queued callback ended the rescheduled turn")
	}
	g.expireTurnTimer(ctx, currentVersion, turn, pauseCount, player)
	if g.EndCondition != EndConditionTimeout || player.Time != 0 || table.turnTimer != nil {
		t.Fatal("the current timer did not end the game and cancel its timer")
	}
}

func TestTableDeletionCancelsTimers(t *testing.T) {
	table, ctx := newTimerTestTable(t)
	g := table.Game
	table.Lock(ctx)
	table.recordActivity(ctx)
	oldIdleVersion := table.idleTimerVersion
	table.recordActivity(ctx)
	g.scheduleTurnTimer(ctx)
	turnVersion := table.turnTimerVersion
	table.Unlock(ctx)

	table.expireIdleTimer(ctx, oldIdleVersion)
	if g.EndCondition != EndConditionInProgress {
		t.Fatal("an old idle callback ended an active game")
	}
	table.Lock(ctx)
	tables.Lock(ctx)
	deleteTable(table)
	tables.Unlock(ctx)
	table.Unlock(ctx)
	if table.idleTimer != nil || table.turnTimer != nil {
		t.Fatal("deleted table retained scheduled timers")
	}
	g.expireTurnTimer(ctx, turnVersion, g.Turn, g.PauseCount, g.Players[0])
	if g.EndCondition != EndConditionInProgress {
		t.Fatal("a deleted table's timer executed")
	}
}

func TestAcceptedActionStartsTimerWithoutLoadedMessage(t *testing.T) {
	table, ctx := newTimerTestTable(t)
	g := table.Game
	g.StartedTimer = false
	g.ClueTokens = MaxClueNum
	g.Variant.ClueRanks = []int{1, 2, 3, 4, 5}
	g.MaxScore = 25
	g.Stacks = make([]int, len(g.Variant.Suits))
	g.EndTurn = -1
	commandAction(ctx, NewFakeSession(1, "Alice"), &CommandData{
		TableID: table.ID, Type: ActionTypeRankClue, Target: 1, Value: 1,
	})
	if !g.StartedTimer || g.ActivePlayerIndex != 1 || table.turnTimer == nil {
		t.Fatal("an accepted action left the next player's clock disabled")
	}
}

func TestIdleTimerExpiresInactiveGame(t *testing.T) {
	table, ctx := newTimerTestTable(t)
	table.Lock(ctx)
	table.recordActivity(ctx)
	version := table.idleTimerVersion
	table.idleTimer.Stop()
	table.DatetimeLastAction = time.Now().Add(-IdleGameTimeout - time.Second)
	table.Game.ExtraOptions.NoWriteToDatabase = true
	table.Unlock(ctx)

	table.expireIdleTimer(ctx, version)
	if table.Game.EndCondition != EndConditionIdleTimeout || table.idleTimer != nil {
		t.Fatal("the current idle timer did not end the inactive game")
	}
}

func TestPausedAndFinishedGamesCancelTurnTimers(t *testing.T) {
	table, ctx := newTimerTestTable(t)
	g := table.Game
	table.Lock(ctx)
	defer table.Unlock(ctx)
	g.scheduleTurnTimer(ctx)
	g.Paused = true
	g.scheduleTurnTimer(ctx)
	if table.turnTimer != nil {
		t.Fatal("a paused game retained a turn timer")
	}
	g.Paused = false
	g.scheduleTurnTimer(ctx)
	g.EndCondition = EndConditionNormal
	g.ExtraOptions.NoWriteToDatabase = true
	g.End(ctx, &CommandData{})
	if table.turnTimer != nil {
		t.Fatal("a finished game retained a turn timer")
	}
}

func TestFailedDrainRearmsOriginalDeadlines(t *testing.T) {
	table, ctx := newTimerTestTable(t)
	g := table.Game
	table.Lock(ctx)
	table.recordActivity(ctx)
	g.scheduleTurnTimer(ctx)
	idleVersion, turnVersion := table.idleTimerVersion, table.turnTimerVersion
	lastAction, turnBegin, playerTime := table.DatetimeLastAction, g.DatetimeTurnBegin, g.Players[0].Time
	table.Unlock(ctx)

	incomingCommands.drain()
	g.expireTurnTimer(ctx, turnVersion, g.Turn, g.PauseCount, g.Players[0])
	if g.EndCondition != EndConditionInProgress {
		t.Fatal("a timer mutated the game during a drain")
	}
	resumeIncomingCommands(ctx)
	table.Lock(ctx)
	defer table.Unlock(ctx)
	if table.idleTimer == nil || table.turnTimer == nil ||
		table.idleTimerVersion == idleVersion || table.turnTimerVersion == turnVersion {
		t.Fatal("timers were not rearmed after resuming")
	}
	if !table.DatetimeLastAction.Equal(lastAction) || !g.DatetimeTurnBegin.Equal(turnBegin) ||
		g.Players[0].Time != playerTime {
		t.Fatal("resuming changed the original game deadlines")
	}
}

func TestRestoreTableClockExcludesDowntime(t *testing.T) {
	turnBegin := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
	savedAt := turnBegin.Add(10 * time.Second)
	resumedAt := turnBegin.Add(time.Hour)
	for _, test := range []struct {
		name    string
		timed   bool
		started bool
		paused  bool
		legacy  bool
		want    time.Duration
	}{
		{"running timed", true, true, false, false, 70 * time.Second},
		{"paused timed", true, true, true, false, 80 * time.Second},
		{"not loaded", true, false, false, false, 80 * time.Second},
		{"legacy timed", true, true, false, true, 80 * time.Second},
		{"untimed", false, true, false, false, 50 * time.Second},
	} {
		t.Run(test.name, func(t *testing.T) {
			table := snapshotTestTable()
			g := table.Game
			g.Options.Timed, g.StartedTimer, g.Paused = test.timed, test.started, test.paused
			g.DatetimeTurnBegin = turnBegin
			g.Players[0].Time = time.Minute
			if !test.legacy {
				table.snapshotSavedAt = savedAt
			}
			restoreTableClock(table, resumedAt)
			if g.Players[0].Time != test.want || !g.DatetimeTurnBegin.Equal(resumedAt) {
				t.Fatalf("restored clock = %s, turn start = %v", g.Players[0].Time, g.DatetimeTurnBegin)
			}
		})
	}
}

func TestAbortedRestartDiscardsStaleSnapshots(t *testing.T) {
	_, ctx := newTimerTestTable(t)
	oldPath := tablesPath
	t.Cleanup(func() { tablesPath = oldPath })
	tablesPath = t.TempDir()
	snapshot := filepath.Join(tablesPath, "42.json")
	temporary := filepath.Join(tablesPath, ".42.json.tmp-interrupted")
	for _, filename := range []string{snapshot, temporary} {
		if err := os.WriteFile(filename, []byte("{}"), 0600); err != nil {
			t.Fatal(err)
		}
	}
	incomingCommands.drain()
	abortRestart(ctx)
	if !incomingCommands.enter() {
		t.Fatal("restart did not resume after discarding its snapshots")
	}
	incomingCommands.leave()
	if _, err := os.Stat(snapshot); !os.IsNotExist(err) {
		t.Fatalf("aborted restart left a restorable stale snapshot: %v", err)
	}
	if _, err := os.Stat(temporary); err != nil {
		t.Fatalf("cleanup removed a file outside the restorable snapshot set: %v", err)
	}
}

func TestAbortedRestartStaysBlockedWhenCleanupFails(t *testing.T) {
	_, ctx := newTimerTestTable(t)
	oldPath := tablesPath
	t.Cleanup(func() { tablesPath = oldPath })
	tablesPath = filepath.Join(t.TempDir(), "not-a-directory")
	if err := os.WriteFile(tablesPath, []byte("unavailable"), 0600); err != nil {
		t.Fatal(err)
	}
	incomingCommands.drain()
	abortRestart(ctx)
	if incomingCommands.enter() {
		incomingCommands.leave()
		t.Fatal("restart resumed despite failing to remove stale snapshots")
	}
}
