package main

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"
)

type memoryActiveGames struct {
	rows              map[int]activeGameCheckpoint
	err               error
	commitBeforeError bool
	beforeSave        func()
}

type uncertainActiveGames struct{ activeGameStore }

func (s uncertainActiveGames) Save(ctx context.Context, c activeGameCheckpoint) error {
	if err := s.activeGameStore.Save(ctx, c); err != nil {
		return err
	}
	return errors.New("connection lost after commit")
}

func injectMemoryRecovery(t *testing.T) *memoryActiveGames {
	t.Helper()
	old := recoveryStore
	store := &memoryActiveGames{rows: make(map[int]activeGameCheckpoint)}
	recoveryStore = store
	t.Cleanup(func() { recoveryStore = old })
	return store
}

func (s *memoryActiveGames) Save(_ context.Context, c activeGameCheckpoint) error {
	if s.beforeSave != nil {
		s.beforeSave()
	}
	if s.err != nil && !s.commitBeforeError {
		return s.err
	}
	if previous, exists := s.rows[c.ID]; exists && previous.Revision+1 != c.Revision {
		return errors.New("revision conflict")
	}
	c.Data = append([]byte(nil), c.Data...)
	s.rows[c.ID] = c
	return s.err
}

func (s *memoryActiveGames) Load(context.Context) ([]activeGameCheckpoint, error) {
	rows := make([]activeGameCheckpoint, 0, len(s.rows))
	for _, row := range s.rows {
		rows = append(rows, row)
	}
	return rows, nil
}

func (*memoryActiveGames) Completed(context.Context, int) (bool, error) { return false, nil }

func prepareRecoveryAction(table *Table) {
	g := table.Game
	g.ClueTokens = MaxClueNum
	g.Variant.ClueRanks = []int{1, 2, 3, 4, 5}
	g.MaxScore = 25
	g.Stacks = make([]int, len(g.Variant.Suits))
	g.EndTurn = -1
	g.Tags = make(map[string]int)
	for _, p := range g.Players {
		p.Notes = make([]string, g.GetNotesSize())
	}
}

func TestActiveGameFailureDropsEffectsAndFreezesOnlyAffectedTable(t *testing.T) {
	for _, committed := range []bool{false, true} {
		t.Run(map[bool]string{false: "before commit", true: "uncertain committed"}[committed], func(t *testing.T) {
			table, ctx := newTimerTestTable(t)
			prepareRecoveryAction(table)
			store := recoveryStore.(*memoryActiveGames)
			store.err, store.commitBeforeError = errors.New("injected storage failure"), committed
			published := false
			table.Lock(ctx)
			ok := table.mutate(ctx, NewFakeSession(1, "Alice"), &CommandData{RequestID: "accepted"}, func() {
				table.Game.Players[0].Notes[0] = "hidden note"
				table.afterCommit(func() { published = true })
				table.Game.scheduleTurnTimer(ctx)
			})
			table.Unlock(ctx)
			if ok || published || !table.recoveryBlocked.Load() || table.turnTimer != nil || len(table.pendingEffects) != 0 {
				t.Fatal("storage failure exposed effects or retained a mutable table/timer")
			}
			before, err := encodeTableSnapshotAt(table, time.Time{})
			if err != nil {
				t.Fatal(err)
			}
			s := NewFakeSession(1, "Alice")
			commandLoaded(ctx, s, &CommandData{TableID: table.ID})
			commandNote(ctx, s, &CommandData{TableID: table.ID, Order: 0, Note: "overwrite"})
			commandTag(ctx, s, &CommandData{TableID: table.ID, Msg: "tag"})
			commandPause(ctx, s, &CommandData{TableID: table.ID, Setting: "pause"})
			commandAction(ctx, s, &CommandData{TableID: table.ID, Type: ActionTypeRankClue, Target: 1, Value: 1})
			commandChatTable(ctx, s, &CommandData{Msg: "unsafe"}, table.ID)
			commandTableVoteForTermination(ctx, s, &CommandData{TableID: table.ID})
			after, err := encodeTableSnapshotAt(table, time.Time{})
			if err != nil || string(after) != string(before) {
				t.Fatal("a blocked table accepted a mutation", err)
			}
			if _, exists := getTable(nil, table.ID, true); exists || len(tables.GetList(true)) != 0 {
				t.Fatal("a read helper exposed speculative state")
			}
			if _, exists := tables.Get(table.ID, true); exists {
				t.Fatal("direct table lookup exposed speculative state")
			}
			if found, failure := tables.getAvailable(table.ID, true); found != nil ||
				!strings.Contains(failure, "unavailable") || !strings.Contains(failure, "recovery") {
				t.Fatal("a frozen table did not provide a recovery diagnostic")
			}
			row, exists := store.rows[table.Game.DatabaseID]
			if exists != committed {
				t.Fatal("fault injection did not exercise the requested commit outcome")
			}
			if committed {
				restored, err := decodeTableSnapshot(row.Data)
				if err != nil || restored.Game.Players[0].Notes[0] != "hidden note" ||
					!restored.duplicateRequest(s, &CommandData{RequestID: "accepted"}) {
					t.Fatal("committed-before-broadcast state or request receipt was lost", err)
				}
			}
			store.err = nil
			other := snapshotTestTable()
			other.Game.DatabaseID++
			other.Lock(ctx)
			ok = other.mutate(ctx, nil, &CommandData{}, func() { other.Game.Score++ })
			other.cancelTimers()
			other.Unlock(ctx)
			if !ok {
				t.Fatal("independent table stopped accepting mutations")
			}
		})
	}
}

func TestActiveGamePanicNeverCheckpointsPartialState(t *testing.T) {
	table, ctx := newTimerTestTable(t)
	store := recoveryStore.(*memoryActiveGames)
	func() {
		table.Lock(ctx)
		defer table.Unlock(ctx)
		defer func() {
			if recover() != "injected panic" {
				t.Error("mutation panic was swallowed or changed")
			}
		}()
		table.mutate(ctx, nil, &CommandData{}, func() {
			table.Game.Score++
			table.afterCommit(func() { t.Error("partial transition was published") })
			panic("injected panic")
		})
	}()
	if len(store.rows) != 0 || !table.recoveryBlocked.Load() {
		t.Fatal("partial state was saved after a panic")
	}
}

func TestActiveGameDuplicateActionAndQueuedPauseShareCheckpoint(t *testing.T) {
	table, ctx := newTimerTestTable(t)
	prepareRecoveryAction(table)
	store := recoveryStore.(*memoryActiveGames)
	table.Game.Players[1].RequestedPause = true
	s := NewFakeSession(1, "Alice")
	request := &CommandData{TableID: table.ID, RequestID: "clue-1", Type: ActionTypeRankClue, Target: 1, Value: 1}
	commandAction(ctx, s, request)
	g := table.Game
	if g.ActivePlayerIndex != 1 || !g.Paused || g.Players[1].RequestedPause || table.recoveryRevision != 1 {
		t.Fatal("the action and disconnected player's queued pause were not atomic")
	}
	actions, chat, clock := len(g.Actions), len(table.Chat), g.Players[1].Time
	commandAction(ctx, s, request)
	if len(g.Actions) != actions || len(table.Chat) != chat || g.Players[1].Time != clock || table.recoveryRevision != 1 {
		t.Fatal("a duplicate request was applied twice")
	}
	restored, err := decodeTableSnapshot(store.rows[g.DatabaseID].Data)
	if err != nil || !restored.Game.Paused || restored.Game.Players[1].RequestedPause ||
		!reflect.DeepEqual(restored.Game.Actions, g.Actions) || len(restored.Chat) != chat {
		t.Fatal("the full action/pause checkpoint was not restorable", err)
	}
	if !restored.duplicateRequest(s, request) {
		t.Fatal("restoration lost the processed request ID")
	}
}

type observedPayload struct {
	value *string
	seen  *[]string
}

func (p observedPayload) MarshalJSON() ([]byte, error) {
	*p.seen = append(*p.seen, *p.value)
	return []byte(`{"value":"frozen"}`), nil
}

func TestActiveGameFreezesPayloadsBeforeStorageAndExcludesStorageLatency(t *testing.T) {
	table, ctx := newTimerTestTable(t)
	store := recoveryStore.(*memoryActiveGames)
	value, seen := "private", []string{}
	store.beforeSave = func() {
		if !reflect.DeepEqual(seen, []string{"private"}) {
			t.Error("notification was not serialized at creation time")
		}
		time.Sleep(25 * time.Millisecond)
	}
	begin := time.Now()
	table.Lock(ctx)
	ok := table.mutate(ctx, nil, &CommandData{}, func() {
		table.Game.DatetimeTurnBegin = begin
		table.emit(NewFakeSession(1, "Alice"), "probe", observedPayload{&value, &seen})
		value = "revealed later"
	})
	table.Unlock(ctx)
	if !ok || table.Game.DatetimeTurnBegin.Sub(begin) < 25*time.Millisecond ||
		!reflect.DeepEqual(seen, []string{"private"}) {
		t.Fatal("storage latency was charged or a queued payload was evaluated late")
	}
}

func TestActiveGameRestorationRetainsCheckpointAndHiddenState(t *testing.T) {
	table, ctx := newTimerTestTable(t)
	prepareRecoveryAction(table)
	store := recoveryStore.(*memoryActiveGames)
	oldPath := tablesPath
	tablesPath = t.TempDir()
	t.Cleanup(func() { tablesPath = oldPath })
	g := table.Game
	g.Players[0].Notes[0] = "private"
	g.Players[1].RequestedPause = true
	g.Tags["hidden"] = 1
	table.Chat = []*TableChatMessage{{UserID: 1, Msg: "chat", Datetime: time.Now()}}
	savedAt := time.Now().Add(-time.Hour)
	g.DatetimeTurnBegin = savedAt.Add(-10 * time.Second)
	g.Players[0].Time = time.Minute
	table.ProcessedRequests = map[string]bool{"1:seen": true}
	if err := table.checkpoint(ctx, savedAt); err != nil {
		t.Fatal(err)
	}

	assertRepeatedRestoration(t, table, ctx, store)
}

func TestActiveGamePostgresFailureAndIndependentPool(t *testing.T) {
	database := gamePersistenceDatabase(t)
	store := recoveryStore
	table, ctx := newTimerTestTable(t)
	recoveryStore = store
	prepareRecoveryAction(table)
	id, err := (&Games{}).ReserveID()
	if err != nil {
		t.Fatal(err)
	}
	table.Game.DatabaseID = id
	table.Lock(ctx)
	err = table.checkpoint(ctx, time.Now())
	table.Unlock(ctx)
	if err != nil {
		t.Fatal(err)
	}
	// Keep every ordinary connection checked out while a synchronous table write
	// succeeds. Recovery must never wait for a holder waiting on this table lock.
	for i := int32(0); i < database.pool.Config().MaxConns; i++ {
		connection, err := database.pool.Acquire(ctx)
		if err != nil {
			t.Fatal(err)
		}
		defer connection.Release()
	}
	deadline, cancel := context.WithTimeout(ctx, time.Second)
	defer cancel()
	table.Lock(ctx)
	ok := table.mutate(deadline, NewFakeSession(1, "Alice"), &CommandData{RequestID: "note"}, func() {
		table.Game.Players[0].Notes[0] = "survives main pool exhaustion"
	})
	table.Unlock(ctx)
	if !ok || table.recoveryRevision != 2 {
		t.Fatal("checkpoint depended on the exhausted main pool")
	}
	pg := store.(*postgresActiveGames)
	if _, err := pg.db.Exec(ctx, "ALTER TABLE active_games ADD CONSTRAINT reject_checkpoint CHECK (FALSE) NOT VALID"); err != nil {
		t.Fatal(err)
	}
	published := false
	table.Lock(ctx)
	ok = table.mutate(ctx, nil, &CommandData{}, func() {
		table.Game.Players[0].Notes[0] = "must not replace durable note"
		table.afterCommit(func() { published = true })
	})
	table.Unlock(ctx)
	if ok || published || !table.recoveryBlocked.Load() {
		t.Fatal("database checkpoint failure exposed speculative state")
	}
	rows, err := store.Load(ctx)
	if err != nil || len(rows) != 1 || rows[0].Revision != 2 {
		t.Fatal("failed write changed the durable revision", err)
	}
	restored, err := decodeTableSnapshot(rows[0].Data)
	if err != nil || restored.Game.Players[0].Notes[0] != "survives main pool exhaustion" {
		t.Fatal("failed write replaced durable state", err)
	}
}

func TestActiveGameTerminalRecoveryAndCompletedFilesNeverResurrect(t *testing.T) {
	database, table := gameCompletionTestTable(t)
	oldTables, oldPath := tables, tablesPath
	tables, tablesPath = NewTables(), t.TempDir()
	t.Cleanup(func() { tables, tablesPath = oldTables, oldPath })
	ctx := NewMiscContext("terminalRecoveryTest")
	if err := table.checkpoint(ctx, time.Now()); err != nil {
		t.Fatal(err)
	}
	data, err := encodeTableSnapshot(table)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := database.Exec(ctx, "ALTER TABLE game_tags ADD CONSTRAINT reject_completion CHECK (FALSE) NOT VALID"); err != nil {
		t.Fatal(err)
	}
	if err := restoreTables(); err == nil || len(tables.GetList(true)) != 0 {
		t.Fatal("failed terminal completion was published")
	}
	rows, err := recoveryStore.Load(ctx)
	if err != nil || len(rows) != 1 {
		t.Fatal("failed completion deleted the terminal checkpoint", err)
	}
	if _, err := database.Exec(ctx, "ALTER TABLE game_tags DROP CONSTRAINT reject_completion"); err != nil {
		t.Fatal(err)
	}
	if err := restoreTables(); err != nil {
		t.Fatal(err)
	}
	rows, err = recoveryStore.Load(ctx)
	if err != nil || len(rows) != 0 {
		t.Fatal("completion did not remove its checkpoint", err)
	}
	if err := writeTableSnapshot(filepath.Join(tablesPath, "42.json"), data); err != nil {
		t.Fatal(err)
	}
	if err := restoreTables(); err != nil || len(tables.GetList(true)) != 0 {
		t.Fatal("a stale completed snapshot resurrected a game", err)
	}
	if err := recoveryStore.Save(ctx, activeGameCheckpoint{table.Game.DatabaseID, 1, data}); err == nil {
		t.Fatal("a completed ID accepted a new active checkpoint")
	}
	var games, participants int
	if err := database.QueryRow(ctx, "SELECT (SELECT COUNT(*) FROM games), (SELECT COUNT(*) FROM game_participants)").Scan(&games, &participants); err != nil || games != 1 || participants != 2 {
		t.Fatal("terminal recovery duplicated completion records", err)
	}
}
func assertRepeatedRestoration(t *testing.T, table *Table, ctx context.Context, store *memoryActiveGames) {
	t.Helper()
	g := table.Game
	// An emergency file may be ahead of the last accepted database checkpoint.
	g.Players[0].Notes[0] = "speculative"
	data, err := encodeTableSnapshot(table)
	if err != nil {
		t.Fatal(err)
	}
	if err := writeTableSnapshot(filepath.Join(tablesPath, "42.json"), data); err != nil {
		t.Fatal(err)
	}
	for attempt := 0; attempt < 2; attempt++ {
		tables = NewTables()
		if err := restoreTables(); err != nil {
			t.Fatal(err)
		}
		restored, ok := tables.Get(table.ID, true)
		if !ok {
			t.Fatal("active database checkpoint was consumed")
		}
		restored.Lock(ctx)
		rg := restored.Game
		if rg.Players[0].Notes[0] != "private" || !rg.Players[1].RequestedPause ||
			rg.Tags["hidden"] != 1 || len(restored.Chat) != 1 ||
			rg.Players[0].Time != 50*time.Second || rg.ExtraOptions.NoWriteToDatabase ||
			rg.Players[0].Hand[0] != rg.Deck[0] || restored.recoveryRevision != 1 ||
			!restored.ProcessedRequests["1:seen"] {
			t.Error("restoration lost private state, aliases, revision, or clock semantics")
		}
		draw := CheckScrub(restored, ActionDraw{Type: "draw", PlayerIndex: 0, Order: 0, Rank: 2, SuitIndex: 1}, 1).(ActionDraw)
		if draw.Rank != -1 || draw.SuitIndex != -1 {
			t.Error("restored action exposed a player's hidden card")
		}
		restored.cancelTimers()
		restored.Unlock(ctx)
	}
	if len(store.rows) != 1 {
		t.Fatal("restoration removed durable active state")
	}
	if _, err := os.Stat(filepath.Join(tablesPath, "42.json")); !os.IsNotExist(err) {
		t.Fatal("reconciled flat snapshot was not removed", err)
	}
}
