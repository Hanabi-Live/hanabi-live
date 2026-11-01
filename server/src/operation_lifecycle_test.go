package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
)

func TestDrainWaitsForRegisteredBackgroundWork(t *testing.T) {
	gate := &commandGate{}
	if !gate.enter() {
		t.Fatal("operation was not admitted")
	}
	started := make(chan struct{})
	release := make(chan struct{})
	gate.runBackground(func() {
		close(started)
		<-release
	})
	gate.leave()
	<-started
	drained := make(chan struct{})
	go func() {
		gate.drain()
		close(drained)
	}()
	select {
	case <-drained:
		close(release)
		t.Fatal("drain discarded registered background work")
	case <-time.After(20 * time.Millisecond):
	}
	close(release)
	select {
	case <-drained:
	case <-time.After(time.Second):
		t.Fatal("drain did not finish after background work completed")
	}
}

func TestAdministrativeMutationsRespectDrain(t *testing.T) {
	oldGate := incomingCommands
	t.Cleanup(func() { incomingCommands = oldGate })
	incomingCommands = &commandGate{}
	router := gin.New()
	mutations := router.Group("")
	mutations.Use(admitAdministrativeCommand)
	calls := 0
	mutations.POST("/mutate", func(c *gin.Context) {
		calls++
		c.Status(http.StatusNoContent)
	})
	request := httptest.NewRequest(http.MethodPost, "/mutate", nil)
	incomingCommands.drain()
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	if response.Code != http.StatusServiceUnavailable || calls != 0 {
		t.Fatal("administrative mutation ran during a drain")
	}
	incomingCommands.resume()
	response = httptest.NewRecorder()
	router.ServeHTTP(response, request)
	if response.Code != http.StatusNoContent || calls != 1 {
		t.Fatal("administrative mutation did not resume")
	}
}

func TestTypingTimersCoalesceAndClear(t *testing.T) {
	table, ctx := newTimerTestTable(t)
	session := NewFakeSession(1, "Alice")
	table.Lock(ctx)
	chatTyping(ctx, session, table, 0, -1)
	first := table.typingTimers[1]
	chatTyping(ctx, session, table, 0, -1)
	current := table.typingTimers[1]
	current.Stop()
	if first == current || len(table.typingTimers) != 1 {
		table.Unlock(ctx)
		t.Fatal("typing updates did not replace the previous timer")
	}
	table.Unlock(ctx)
	chatTypingCheckStopped(ctx, table, 1)
	table.Lock(ctx)
	if !table.Players[0].Typing || table.typingTimers[1] != current {
		table.Unlock(ctx)
		t.Fatal("an old callback cleared fresh typing activity")
	}
	table.Players[0].LastTyped = time.Now().Add(-TypingDelay - time.Second)
	table.Unlock(ctx)
	chatTypingCheckStopped(ctx, table, 1)
	table.Lock(ctx)
	defer table.Unlock(ctx)
	if table.Players[0].Typing || len(table.typingTimers) != 0 {
		t.Fatal("expired typing activity was not cleared")
	}
}

func TestScheduledStartRejectsReplacedOrDeletedTable(t *testing.T) {
	table, ctx := newTimerTestTable(t)
	table.Lock(ctx)
	table.Running = false
	table.DatetimePlannedStart = time.Now().Add(time.Hour)
	oldStart := table.DatetimePlannedStart
	table.scheduleStartTimer(ctx)
	table.DatetimePlannedStart = oldStart.Add(time.Hour)
	table.scheduleStartTimer(ctx)
	current := table.startTimer
	table.Unlock(ctx)
	startIn(ctx, table, oldStart)
	if table.Running || table.startTimer != current {
		t.Fatal("a replaced automatic-start callback changed the table")
	}
	table.Lock(ctx)
	tables.Lock(ctx)
	deleteTable(table)
	tables.Unlock(ctx)
	table.Unlock(ctx)
	if table.startTimer != nil {
		t.Fatal("deleted table retained its automatic-start timer")
	}
	startIn(ctx, table, oldStart)
}

func TestOldShutdownCallbacksCannotAffectNewSchedule(t *testing.T) {
	oldTime, oldFlag, oldProject := datetimeShutdownInit.Load(), shuttingDown.IsSet(), projectPath
	t.Cleanup(func() {
		datetimeShutdownInit.Store(oldTime)
		if oldFlag {
			shuttingDown.Set()
		} else {
			shuttingDown.UnSet()
		}
		projectPath = oldProject
	})
	projectPath = t.TempDir()
	oldStart := time.Now().Add(-ShutdownTimeout - time.Minute)
	currentStart := time.Now()
	datetimeShutdownInit.Store(currentStart)
	shuttingDown.Set()
	ctx := NewMiscContext("test")
	shutdownXMinutesLeft(ctx, 5, oldStart)
	if !shutdownWaitSub(ctx, oldStart) {
		t.Fatal("an obsolete shutdown loop continued")
	}
	shutdownImmediate(ctx, oldStart)
	if !shutdownIsCurrent(currentStart) {
		t.Fatal("obsolete shutdown callbacks changed the new schedule")
	}
}
