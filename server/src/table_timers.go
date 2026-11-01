package main

import (
	"context"
	"time"
)

// Timer scheduling and cancellation require the table lock.
func (t *Table) recordActivity(ctx context.Context) {
	if isDev || t.Deleted || t.Ending {
		return
	}
	t.DatetimeLastAction = time.Now()
	t.scheduleIdleTimer(ctx)
}

func (t *Table) cancelIdleTimer() {
	t.idleTimerVersion++
	if t.idleTimer != nil {
		t.idleTimer.Stop()
		t.idleTimer = nil
	}
}

func (t *Table) cancelTurnTimer() {
	t.turnTimerVersion++
	if t.turnTimer != nil {
		t.turnTimer.Stop()
		t.turnTimer = nil
	}
}

func (t *Table) cancelStartTimer() {
	if t.startTimer != nil {
		t.startTimer.Stop()
		t.startTimer = nil
	}
	t.DatetimePlannedStart = time.Time{}
}

func (t *Table) cancelTypingTimer(userID int) {
	if timer := t.typingTimers[userID]; timer != nil {
		timer.Stop()
		delete(t.typingTimers, userID)
	}
}

func (t *Table) cancelTimers() {
	t.cancelIdleTimer()
	t.cancelTurnTimer()
	t.cancelStartTimer()
	for userID := range t.typingTimers {
		t.cancelTypingTimer(userID)
	}
}

func (t *Table) scheduleStartTimer(ctx context.Context) {
	if t.startTimer != nil {
		t.startTimer.Stop()
	}
	planned := t.DatetimePlannedStart
	if t.Deleted || t.Running || planned.IsZero() {
		t.startTimer = nil
		return
	}
	t.startTimer = time.AfterFunc(time.Until(planned), func() {
		startIn(ctx, t, planned)
	})
}

func (t *Table) scheduleIdleTimer(ctx context.Context) {
	t.cancelIdleTimer()
	if t.mutationActive || t.recoveryBlocked.Load() {
		return
	}
	if isDev || t.Deleted || t.Ending || t.DatetimeLastAction.IsZero() {
		return
	}
	version := t.idleTimerVersion
	t.idleTimer = time.AfterFunc(time.Until(t.DatetimeLastAction.Add(IdleGameTimeout)), func() {
		t.expireIdleTimer(ctx, version)
	})
}

func (t *Table) expireIdleTimer(ctx context.Context, version uint64) {
	if !incomingCommands.enter() {
		return
	}
	defer incomingCommands.leave()
	current, exists := getTableAndLock(ctx, nil, t.ID, true, true)
	if !exists {
		return
	}
	defer current.Unlock(ctx)
	if current != t || version != t.idleTimerVersion {
		return
	}
	t.idleTimer = nil
	if t.Ending {
		return
	}
	if time.Since(t.DatetimeLastAction) < IdleGameTimeout {
		t.scheduleIdleTimer(ctx)
		return
	}
	t.EndIdle(ctx)
}

func (g *Game) scheduleTurnTimer(ctx context.Context) {
	t := g.Table
	t.cancelTurnTimer()
	if t.mutationActive || t.recoveryBlocked.Load() {
		return
	}
	if t.Deleted || t.Ending || !t.Running || t.Replay || t.Game != g ||
		!g.Options.Timed || !g.StartedTimer || g.Paused ||
		g.EndCondition != EndConditionInProgress || g.ExtraOptions.NoWriteToDatabase {
		return
	}
	version, turn, pauseCount := t.turnTimerVersion, g.Turn, g.PauseCount
	player := g.Players[g.ActivePlayerIndex]
	deadline := g.DatetimeTurnBegin.Add(player.Time)
	t.turnTimer = time.AfterFunc(time.Until(deadline), func() {
		g.expireTurnTimer(ctx, version, turn, pauseCount, player)
	})
}

func (g *Game) expireTurnTimer(ctx context.Context, version uint64, turn, pauseCount int, player *GamePlayer) {
	if !incomingCommands.enter() {
		return
	}
	defer incomingCommands.leave()
	t := g.Table
	current, exists := getTableAndLock(ctx, nil, t.ID, true, true)
	if !exists {
		return
	}
	defer current.Unlock(ctx)
	if current != t || version != t.turnTimerVersion {
		return
	}
	t.turnTimer = nil
	if t.Game != g || t.Ending || !t.Running || t.Replay || g.Turn != turn ||
		g.PauseCount != pauseCount || g.Paused || g.EndCondition != EndConditionInProgress ||
		g.Players[g.ActivePlayerIndex] != player {
		return
	}
	g.EndTimer(ctx, player)
}

func resumeIncomingCommands(ctx context.Context) {
	incomingCommands.resume()
	// Callbacks that expired during the drain were rejected; rearm their original deadlines.
	for _, table := range tables.GetList(true) {
		table.Lock(ctx)
		table.scheduleIdleTimer(ctx)
		if table.Game != nil {
			table.Game.scheduleTurnTimer(ctx)
		}
		table.Unlock(ctx)
	}
}

func restoreTableClock(t *Table, now time.Time) {
	g := t.Game
	player := g.Players[g.ActivePlayerIndex]
	if g.EndCondition == EndConditionInProgress {
		if g.StartedTimer && !g.Paused && !t.snapshotSavedAt.IsZero() {
			if elapsed := t.snapshotSavedAt.Sub(g.DatetimeTurnBegin); elapsed > 0 {
				player.Time -= elapsed
			}
		}
	}
	g.DatetimeTurnBegin = now
}
