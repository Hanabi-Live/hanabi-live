package main

import (
	"net/http"
	"testing"
	"time"

	"github.com/gabstv/melody"
)

func TestDeferredCallbacksWaitForResume(t *testing.T) {
	gate := &commandGate{}
	gate.drain()
	started := make(chan struct{})
	completed := make(chan struct{})
	go func() {
		close(started)
		gate.enterDeferred()
		gate.leave()
		close(completed)
	}()
	<-started
	select {
	case <-completed:
		t.Fatal("a deferred callback entered during the drain")
	case <-time.After(20 * time.Millisecond):
	}
	gate.drain()
	gate.resume()
	select {
	case <-completed:
	case <-time.After(time.Second):
		t.Fatal("a deferred callback was lost after resuming")
	}
}

func TestStaleDisconnectCannotRemoveReplacement(t *testing.T) {
	oldSessions := sessions
	t.Cleanup(func() { sessions = oldSessions })
	sessions = NewSessions()
	old := NewFakeSession(1, "Alice")
	replacement := NewFakeSession(1, "Alice")
	sessions.Set(1, old)
	sessions.Set(1, replacement)
	if websocketDisconnectRemoveFromMap(old) {
		t.Fatal("a stale disconnect removed its replacement session")
	}
	if current, ok := sessions.Get(1); !ok || current != replacement {
		t.Fatal("the current session was changed by a stale disconnect")
	}
	if !websocketDisconnectRemoveFromMap(replacement) || sessions.Length() != 0 {
		t.Fatal("the current session was not removed")
	}
}

func TestConnectionBootstrapRejectsPartialData(t *testing.T) {
	session := &melody.Session{Request: &http.Request{RemoteAddr: "invalid"}}
	if data := websocketConnectGetData(NewMiscContext("test"), session, 1, "Alice"); data != nil {
		t.Fatal("invalid connection metadata produced a partial bootstrap")
	}
}

func TestConnectionBootstrapRejectsDatabaseFailure(t *testing.T) {
	database, _ := newMigrationTestDatabase(t)
	oldDB, oldModels := db, models
	t.Cleanup(func() { db, models = oldDB, oldModels })
	db, models = database, &Models{}
	session := &melody.Session{Request: &http.Request{RemoteAddr: "127.0.0.1:1234"}}
	if data := websocketConnectGetData(NewMiscContext("test"), session, 1, "Alice"); data != nil {
		t.Fatal("a database failure produced a partial authenticated bootstrap")
	}
}

func TestPlayingTableSnapshotDoesNotAliasMembership(t *testing.T) {
	tables := NewTables()
	ctx := NewMiscContext("test")
	tables.Lock(ctx)
	defer tables.Unlock(ctx)
	tables.AddPlaying(1, 42)
	snapshot := tables.GetTablesUserPlaying(1)
	snapshot[0] = 100
	if tables.GetTablesUserPlaying(1)[0] != 42 {
		t.Fatal("a bootstrap snapshot modified live table membership")
	}
}
