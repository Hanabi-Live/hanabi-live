package main

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gabstv/melody"
	"github.com/gorilla/websocket"
)

func TestActiveGameStartFailureDoesNotPublishStart(t *testing.T) {
	table, ctx := newTimerTestTable(t)
	store := recoveryStore.(*memoryActiveGames)
	store.err = errors.New("initial checkpoint unavailable")
	oldVariants := variants
	variants = map[string]*Variant{DefaultVariantName: table.Game.Variant}
	t.Cleanup(func() { variants = oldVariants })
	table.Options.VariantName = DefaultVariantName
	table.Options.Timed = false
	table.ExtraOptions.SetSeedSuffix = "durable-start"
	table.reservedGameID = 101
	table.Running, table.Game = false, nil
	s := NewFakeSession(1, "Alice")
	table.Players[0].Session, table.Players[0].Present = s, true
	store.beforeSave = func() {
		if !table.Running || table.Game == nil || s.Status() == StatusPlaying || len(table.pendingEffects) == 0 {
			t.Error("initial state was not prepared before saving or was published too early")
		}
	}
	commandTableStart(ctx, s, &CommandData{TableID: table.ID})
	if !table.recoveryBlocked.Load() || s.Status() == StatusPlaying || len(store.rows) != 0 || len(table.pendingEffects) != 0 {
		t.Fatal("failed initial checkpoint published a game start")
	}
}

func TestActiveGameMembershipNoticePersistsOutsideGlobalLock(t *testing.T) {
	table, ctx := newTimerTestTable(t)
	store := recoveryStore.(*memoryActiveGames)
	store.beforeSave = func() {
		tables.RLock()
		tables.RUnlock()
	}
	table.Lock(ctx)
	tables.Lock(ctx)
	commandChatTable(ctx, nil, &CommandData{
		Server: true, NoTableLock: true, NoTablesLock: true,
		Msg: "A spectator joined.", Room: table.GetRoomName(),
	}, table.ID)
	if len(store.rows) != 0 || len(table.Chat) != 0 {
		t.Error("a membership notice persisted under the global lock")
	}
	tables.Unlock(ctx)
	table.Unlock(ctx)
	incomingCommands.drain()
	if len(store.rows) != 1 || len(table.Chat) != 1 {
		t.Fatal("the admitted notice was not persisted before draining completed")
	}
}

func TestActiveTagDeletionIsDurableBeforeAcknowledgement(t *testing.T) {
	for _, fail := range []bool{false, true} {
		t.Run(map[bool]string{false: "success", true: "storage failure"}[fail], func(t *testing.T) {
			table, ctx := newTimerTestTable(t)
			prepareRecoveryAction(table)
			store := recoveryStore.(*memoryActiveGames)
			s := NewFakeSession(1, "Alice")
			commandTag(ctx, s, &CommandData{TableID: table.ID, Msg: "private tag"})
			if fail {
				store.err = errors.New("delete checkpoint failed")
			}
			store.beforeSave = func() {
				if _, exists := table.Game.Tags["private tag"]; exists || len(table.pendingEffects) != 1 {
					t.Error("tag deletion did not buffer its private acknowledgement before persistence")
				}
			}
			request := &CommandData{TableID: table.ID, Msg: "private tag", RequestID: "delete"}
			commandTagDelete(ctx, s, request)
			row := store.rows[table.Game.DatabaseID]
			restored, err := decodeTableSnapshot(row.Data)
			if err != nil {
				t.Fatal(err)
			}
			_, retained := restored.Game.Tags["private tag"]
			if retained != fail || table.recoveryBlocked.Load() != fail || len(table.pendingEffects) != 0 {
				t.Fatal("tag deletion failure or success did not match durable state")
			}
			if fail && row.Revision != 1 || !fail && row.Revision != 2 {
				t.Fatal("tag deletion advanced the wrong durable revision")
			}
			if !fail {
				commandTagDelete(ctx, s, request)
				if table.recoveryRevision != 2 || !restored.duplicateRequest(s, request) {
					t.Fatal("a successful tag deletion lost request deduplication")
				}
			}
		})
	}
}

func TestInvalidTimeoutTargetDoesNotMutateOrFreezeGame(t *testing.T) {
	table, ctx := newTimerTestTable(t)
	store := recoveryStore.(*memoryActiveGames)
	table.Lock(ctx)
	table.Game.scheduleTurnTimer(ctx)
	timerVersion := table.turnTimerVersion
	table.Unlock(ctx)
	before, err := encodeTableSnapshotAt(table, time.Time{})
	if err != nil {
		t.Fatal(err)
	}
	for _, target := range []int{-1, len(table.Game.Players), 999} {
		commandAction(ctx, NewFakeSession(1, "Alice"), &CommandData{
			TableID: table.ID, Type: ActionTypeEndGame, Target: target, Value: EndConditionTimeout,
		})
	}
	after, err := encodeTableSnapshotAt(table, time.Time{})
	if err != nil || string(after) != string(before) || table.recoveryBlocked.Load() ||
		len(store.rows) != 0 || table.turnTimerVersion != timerVersion {
		t.Fatal("an invalid timeout target changed state, checkpoints, or timer ownership", err)
	}
}

func recoveryTestSocket(t *testing.T) (*Session, *websocket.Conn) {
	t.Helper()
	m := melody.New()
	connected := make(chan *melody.Session, 1)
	m.HandleConnect(func(s *melody.Session) { connected <- s })
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if err := m.HandleRequest(w, r); err != nil {
			t.Error(err)
		}
	}))
	t.Cleanup(func() {
		_ = m.Close()
		server.Close()
	})
	connection, _, err := websocket.DefaultDialer.Dial("ws"+strings.TrimPrefix(server.URL, "http"), nil)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = connection.Close() })
	s := NewFakeSession(1, "Alice")
	s.ms = <-connected
	return s, connection
}

func TestAuxiliaryCheckpointsPublishAdjustedClock(t *testing.T) {
	for _, scenario := range []string{"note", "chat", "paused note"} {
		t.Run(scenario, func(t *testing.T) {
			table, ctx := newTimerTestTable(t)
			prepareRecoveryAction(table)
			s, connection := recoveryTestSocket(t)
			table.Players[0].Present, table.Players[0].Session = true, s
			g := table.Game
			g.Players[0].Time = time.Minute
			g.DatetimeTurnBegin = time.Now().Add(-10 * time.Second)
			if scenario == "paused note" {
				g.Paused = true
				g.Players[0].Time = 50 * time.Second // Elapsed time was already charged by pause.
			}
			var saveCompleted time.Time
			recoveryStore.(*memoryActiveGames).beforeSave = func() {
				time.Sleep(40 * time.Millisecond)
				saveCompleted = time.Now()
			}
			if scenario == "chat" {
				commandChatTable(ctx, s, &CommandData{Msg: "hello", Room: table.GetRoomName()}, table.ID)
			} else {
				commandNote(ctx, s, &CommandData{TableID: table.ID, Order: 0, Note: "private"})
			}
			if g.Paused {
				table.Lock(ctx)
				s.NotifyTime(table)
				table.Unlock(ctx)
			}
			if err := connection.SetReadDeadline(time.Now().Add(2 * time.Second)); err != nil {
				t.Fatal(err)
			}
			for {
				_, message, err := connection.ReadMessage()
				if err != nil {
					t.Fatal("checkpoint did not publish the adjusted clock:", err)
				}
				if !strings.HasPrefix(string(message), "clock ") {
					continue
				}
				receivedAt := time.Now()
				var clock struct {
					Times     []int64 `json:"times"`
					TimeTaken int64   `json:"timeTaken"`
				}
				if err := json.Unmarshal(message[len("clock "):], &clock); err != nil {
					t.Fatal(err)
				}
				if len(clock.Times) != 2 {
					t.Fatal("clock message omitted player times")
				}
				if g.Paused {
					if clock.Times[0] != 50_000 || clock.TimeTaken != 0 {
						t.Fatal("paused clock subtracted elapsed time twice")
					}
				} else {
					earliest := g.Players[0].Time - receivedAt.Sub(g.DatetimeTurnBegin)
					latest := g.Players[0].Time - saveCompleted.Sub(g.DatetimeTurnBegin)
					if clock.Times[0] < earliest.Milliseconds()-1 || clock.Times[0] > latest.Milliseconds()+1 {
						t.Fatalf("published clock %d disagrees with post-save deadline [%d, %d]",
							clock.Times[0], earliest.Milliseconds(), latest.Milliseconds())
					}
				}
				break
			}
		})
	}
}

func TestActiveGameAuxiliaryCommandsAreDurableAndChatCommandsAreNotReplayed(t *testing.T) {
	table, ctx := newTimerTestTable(t)
	prepareRecoveryAction(table)
	store := recoveryStore.(*memoryActiveGames)
	alice, bob := NewFakeSession(1, "Alice"), NewFakeSession(2, "Bob")
	table.Game.StartedTimer = false
	commandLoaded(ctx, alice, &CommandData{TableID: table.ID, RequestID: "loaded"})
	commandPause(ctx, bob, &CommandData{TableID: table.ID, RequestID: "queue", Setting: "pause-queue"})
	row := store.rows[table.Game.DatabaseID]
	queued, err := decodeTableSnapshot(row.Data)
	if err != nil || !queued.Game.StartedTimer || !queued.Game.Players[1].RequestedPause {
		t.Fatal("loaded clock or queued pause was not persisted", err)
	}
	commandPause(ctx, bob, &CommandData{TableID: table.ID, RequestID: "unqueue", Setting: "pause-unqueue"})
	commandNote(ctx, alice, &CommandData{TableID: table.ID, RequestID: "note", Order: 0, Note: "private note"})
	commandTag(ctx, alice, &CommandData{TableID: table.ID, RequestID: "tag", Msg: "private tag"})
	oldCommands := chatCommandMap
	calls := 0
	chatCommandMap = map[string]func(context.Context, *Session, *CommandData, *Table, string){
		"probe": func(_ context.Context, _ *Session, _ *CommandData, table *Table, _ string) {
			calls++
			saved, err := decodeTableSnapshot(store.rows[table.Game.DatabaseID].Data)
			if err != nil || len(saved.Chat) == 0 || saved.Chat[len(saved.Chat)-1].Msg != "/probe" {
				t.Error("chat command executed before its content was durable", err)
			}
		},
	}
	t.Cleanup(func() { chatCommandMap = oldCommands })
	chat := &CommandData{TableID: table.ID, RequestID: "chat", Msg: "/probe", Username: "Alice", Room: table.GetRoomName()}
	commandChatTable(ctx, alice, chat, table.ID)
	commandChatTable(ctx, alice, chat, table.ID)
	saved, err := decodeTableSnapshot(store.rows[table.Game.DatabaseID].Data)
	if err != nil || saved.Game.Players[1].RequestedPause ||
		saved.Game.Players[0].Notes[0] != "private note" || saved.Game.Tags["private tag"] != 1 ||
		len(saved.Chat) != 1 || calls != 1 || table.recoveryRevision != 6 {
		t.Fatal("auxiliary state or chat deduplication was lost", err)
	}
	commandChatTable(ctx, nil, &CommandData{Server: true, Msg: "/probe", Room: table.GetRoomName()}, table.ID)
	if calls != 1 {
		t.Fatal("server-generated chat executed command effects")
	}
}

func TestActiveGameTerminalTransitionSurvivesCommitBeforeBroadcast(t *testing.T) {
	database, table := gameCompletionTestTable(t)
	oldTables, oldPath, oldActions := tables, tablesPath, actionFunctions
	tables, tablesPath = NewTables(), t.TempDir()
	actionsFunctionsInit()
	t.Cleanup(func() { tables, tablesPath, actionFunctions = oldTables, oldPath, oldActions })
	store := recoveryStore
	recoveryStore = uncertainActiveGames{store}
	t.Cleanup(func() { recoveryStore = store })
	g := table.Game
	g.EndCondition, g.DatetimeFinished, g.Score = EndConditionInProgress, time.Time{}, 5
	table.OwnerID = 1
	for _, p := range table.Players {
		p.Present = false
	}
	tables.Set(table.ID, table)
	ctx := NewMiscContext("terminalCommandTest")
	commandAction(ctx, NewFakeSession(1, "Alice"), &CommandData{
		TableID: table.ID, RequestID: "end", Type: ActionTypeEndGame,
		Target: 0, Value: EndConditionTerminatedByPlayer,
	})
	if !table.recoveryBlocked.Load() || !table.Ending {
		t.Fatal("an uncertain terminal commit did not freeze the table")
	}
	rows, err := store.Load(ctx)
	if err != nil || len(rows) != 1 {
		t.Fatal("terminal transition was not committed", err)
	}
	terminal, err := decodeTableSnapshot(rows[0].Data)
	if err != nil || terminal.Game.DatetimeFinished.IsZero() || terminal.Game.Score != 0 {
		t.Fatal("terminal checkpoint did not include prepared completion state", err)
	}
	if _, ok := terminal.Game.Actions[len(terminal.Game.Actions)-1].(ActionPlayerTimes); !ok {
		t.Fatal("terminal checkpoint omitted final player times")
	}
	var games int
	if err := database.QueryRow(ctx, "SELECT COUNT(*) FROM games").Scan(&games); err != nil || games != 0 {
		t.Fatal("uncertain checkpoint prematurely finalized the game", err)
	}
	tables = NewTables()
	recoveryStore = store
	if err := restoreTables(); err != nil {
		t.Fatal(err)
	}
	if err := database.QueryRow(ctx, "SELECT COUNT(*) FROM games WHERE id = $1 AND score = 0", g.DatabaseID).Scan(&games); err != nil || games != 1 {
		t.Fatal("terminal command was not finalized exactly once after recovery", err)
	}
	rows, err = store.Load(ctx)
	if err != nil || len(rows) != 0 {
		t.Fatal("terminal recovery left active state", err)
	}
}
