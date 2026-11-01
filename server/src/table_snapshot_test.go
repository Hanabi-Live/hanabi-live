package main

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/sasha-s/go-deadlock"
)

func encodeTableSnapshot(t *Table) ([]byte, error) {
	return encodeTableSnapshotAt(t, time.Now())
}

func snapshotTestTable() *Table {
	g := newSeededTestGame("p2v0s1", 2)
	g.DatabaseID = 101
	g.Options.NumPlayers = 2
	g.Options.DetrimentalCharacters = false
	t := &Table{
		ID: 42, Running: true, Game: g, Options: g.Options, ExtraOptions: g.ExtraOptions,
		Players: []*Player{{UserID: 1, Name: "Alice", Present: true}, {UserID: 2, Name: "Bob", Present: true}},
		mutex:   &deadlock.Mutex{},
	}
	g.Table = t
	for i, card := range g.Deck {
		card.Order = i
	}
	g.DeckIndex = 2
	for i, player := range g.Players {
		player.Index = i
		player.Game = g
		player.Hand = []*Card{g.Deck[i]}
	}
	g.Actions = []interface{}{
		ActionCardIdentity{Type: "cardIdentity", PlayerIndex: 0, Order: 0, SuitIndex: 1, Rank: 2},
		ActionClue{Type: "clue", Clue: Clue{Type: 1, Value: 2}, Giver: 0, Target: 1, List: []int{1}, Turn: 1},
		ActionDiscard{Type: "discard", PlayerIndex: 1, Order: 1, SuitIndex: 1, Rank: 2, Failed: true},
		ActionDraw{Type: "draw", PlayerIndex: 0, Order: 0, SuitIndex: 1, Rank: 2},
		ActionGameOver{Type: "gameOver", EndCondition: EndConditionNormal, Votes: []int{0, 1}},
		ActionPlay{Type: "play", PlayerIndex: 0, Order: 0, SuitIndex: 1, Rank: 2},
		ActionPlayerTimes{Type: "playerTimes", PlayerTimes: []int64{1<<54 + 1, -42}, Duration: 1<<54 + 3},
		ActionStrike{Type: "strike", Num: 1, Turn: 1, Order: 1},
		ActionStatus{Type: "status", Clues: 7, Score: 1, MaxScore: 25},
		ActionTurn{Type: "turn", Num: 2, CurrentPlayerIndex: 1},
	}
	return t
}

func TestTableSnapshotRoundTrip(t *testing.T) {
	for _, legacy := range []bool{false, true} {
		name := "versioned"
		if legacy {
			name = "legacy"
		}
		t.Run(name, func(t *testing.T) {
			original := snapshotTestTable()
			var data []byte
			var err error
			if legacy {
				data, err = json.Marshal(original)
			} else {
				data, err = encodeTableSnapshot(original)
			}
			if err != nil {
				t.Fatal(err)
			}
			restored, err := decodeTableSnapshot(data)
			if err != nil {
				t.Fatal(err)
			}
			g := restored.Game
			if restored.snapshotSavedAt.IsZero() != legacy {
				t.Fatal("snapshot time did not preserve the legacy/versioned distinction")
			}
			if !reflect.DeepEqual(g.Actions, original.Game.Actions) {
				t.Fatalf("restored actions lost types or values: %#v", g.Actions)
			}
			if g.Table != restored || g.Options != restored.Options || g.ExtraOptions != restored.ExtraOptions {
				t.Fatal("game relationships were not restored")
			}
			for i, player := range g.Players {
				if player.Game != g || player.Hand[0] != g.Deck[i] || restored.Players[i].Present {
					t.Fatalf("player %d relationships or presence were not restored", i)
				}
			}
			g.Players[0].Hand[0].Touched = true
			if !g.Deck[0].Touched || original.Game.Deck[0].Touched {
				t.Fatal("hand/deck aliases were not restored independently of the original game")
			}
			scrubbed := CheckScrub(restored, g.Actions[3], 1).(ActionDraw)
			if scrubbed.Rank != -1 || scrubbed.SuitIndex != -1 {
				t.Fatal("a restored draw revealed the recipient's card")
			}
		})
	}
}

func TestSnapshotReservedGameIDRemainsStable(t *testing.T) {
	legacy, err := json.Marshal(snapshotTestTable())
	if err != nil {
		t.Fatal(err)
	}
	restored, err := decodeTableSnapshot(legacy)
	if err != nil || restored.Game.DatabaseID != 101 {
		t.Fatalf("snapshot did not preserve its reserved game ID: %v", err)
	}
	id := restored.Game.DatabaseID
	data, err := encodeTableSnapshot(restored)
	if err != nil {
		t.Fatal(err)
	}
	restoredAgain, err := decodeTableSnapshot(data)
	if err != nil || restoredAgain.Game.DatabaseID != id {
		t.Fatalf("reserved ID changed on the next restart: %v", err)
	}
}

func TestLegacySnapshotIDCompatibility(t *testing.T) {
	table := snapshotTestTable()
	table.Game.DatabaseID = 0
	data, err := json.Marshal(table)
	if err != nil {
		t.Fatal(err)
	}
	restored, err := decodeTableSnapshot(data)
	if err != nil || restored.Game.DatabaseID != 0 {
		t.Fatalf("original snapshot should defer reservation until startup: %v", err)
	}
	_, err = decodeTableSnapshot([]byte(`{"SnapshotVersion":1,"Game":{"RecoveryID":"9c262643-43d4-44f4-ad91-9b000014de20"}}`))
	if err == nil || !strings.Contains(err.Error(), "before applying migration 003") {
		t.Fatalf("ambiguous UUID-era snapshot was not rejected explicitly: %v", err)
	}
}

func TestTableSnapshotRejectsInvalidState(t *testing.T) {
	tests := []struct {
		name   string
		mutate func(*Table)
	}{
		{"missing game", func(table *Table) { table.Game = nil }},
		{"invalid reserved ID", func(table *Table) { table.Game.DatabaseID = -1 }},
		{"missing reserved ID", func(table *Table) { table.Game.DatabaseID = 0 }},
		{"missing options", func(table *Table) { table.Options = nil }},
		{"missing player", func(table *Table) { table.Players[0] = nil }},
		{"invalid active player", func(table *Table) { table.Game.ActivePlayerIndex = 2 }},
		{"missing clock start", func(table *Table) { table.Game.StartedTimer = true }},
		{"missing completion time", func(table *Table) { table.Game.EndCondition = EndConditionNormal }},
		{"mismatched player index", func(table *Table) { table.Game.Players[0].Index = 1 }},
		{"missing identity", func(table *Table) { table.Game.CardIdentities[0] = nil }},
		{"missing hand card", func(table *Table) { table.Game.Players[0].Hand[0] = nil }},
		{"duplicate hand card", func(table *Table) { table.Game.Players[1].Hand[0] = table.Game.Deck[0] }},
		{"unknown action", func(table *Table) { table.Game.Actions = []interface{}{map[string]string{"type": "futureAction"}} }},
		{"null action", func(table *Table) { table.Game.Actions = []interface{}{nil} }},
		{"invalid action value", func(table *Table) {
			table.Game.Actions = []interface{}{json.RawMessage(`{"type":"playerTimes","duration":1.5}`)}
		}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			table := snapshotTestTable()
			test.mutate(table)
			data, err := encodeTableSnapshot(table)
			if err != nil {
				t.Fatal(err)
			}
			if _, err := decodeTableSnapshot(data); err == nil {
				t.Fatal("invalid snapshot was accepted")
			}
		})
	}
	for _, data := range []string{`{"SnapshotVersion":3}`, `{"Game":`, `null`} {
		if _, err := decodeTableSnapshot([]byte(data)); err == nil {
			t.Fatalf("invalid snapshot was accepted: %s", data)
		}
	}
}

func TestWriteTableSnapshot(t *testing.T) {
	dir := t.TempDir()
	filename := filepath.Join(dir, "42.json")
	for _, data := range []string{`{"first":true}`, `{"replacement":true}`} {
		if err := writeTableSnapshot(filename, []byte(data)); err != nil {
			t.Fatal(err)
		}
		got, err := os.ReadFile(filename)
		if err != nil || string(got) != data {
			t.Fatalf("snapshot contents = %q, error = %v", got, err)
		}
	}
	files, err := os.ReadDir(dir)
	if err != nil || len(files) != 1 {
		t.Fatalf("temporary files were left behind: %v, %v", files, err)
	}
	info, err := os.Stat(filename)
	if err != nil {
		t.Fatal(err)
	}
	if runtime.GOOS != "windows" && info.Mode().Perm() != 0600 {
		t.Fatalf("snapshot permissions = %v", info.Mode().Perm())
	}
}

func TestWriteTableSnapshotFailure(t *testing.T) {
	dir := t.TempDir()
	filename := filepath.Join(dir, "42.json")
	if err := os.Mkdir(filename, 0700); err != nil {
		t.Fatal(err)
	}
	if err := writeTableSnapshot(filename, []byte("new snapshot")); err == nil {
		t.Fatal("replacing a directory with a snapshot should fail")
	}
	files, err := os.ReadDir(dir)
	if err != nil || len(files) != 1 || !files[0].IsDir() {
		t.Fatalf("failed write changed the destination or left temporary files: %v, %v", files, err)
	}
}

func TestRestoreTableIgnoresInterruptedWrite(t *testing.T) {
	injectMemoryRecovery(t)
	oldTables, oldPath := tables, tablesPath
	t.Cleanup(func() { tables, tablesPath = oldTables, oldPath })
	tables, tablesPath = NewTables(), t.TempDir()
	filename := filepath.Join(tablesPath, ".42.json.tmp-interrupted")
	if err := os.WriteFile(filename, []byte(`{"Game":`), 0600); err != nil {
		t.Fatal(err)
	}
	if err := restoreTables(); err != nil {
		t.Fatal(err)
	}
	if len(tables.GetList(true)) != 0 {
		t.Fatal("an interrupted snapshot write should not be restored")
	}
}

func TestRestoreTablesValidatesEntireSnapshotSet(t *testing.T) {
	for _, scenario := range []string{"malformed later file", "duplicate table", "duplicate game", "existing table"} {
		t.Run(scenario, func(t *testing.T) {
			injectMemoryRecovery(t)
			oldTables, oldPath := tables, tablesPath
			tables, tablesPath = NewTables(), t.TempDir()
			t.Cleanup(func() {
				ctx := NewMiscContext("test")
				for _, table := range tables.GetList(true) {
					table.Lock(ctx)
					table.cancelTimers()
					table.Unlock(ctx)
				}
				tables, tablesPath = oldTables, oldPath
			})

			first := snapshotTestTable()
			firstData, err := encodeTableSnapshot(first)
			if err != nil {
				t.Fatal(err)
			}
			second := snapshotTestTable()
			second.ID = 43
			second.Game.DatabaseID = 102
			if scenario == "duplicate table" {
				second.ID = first.ID
			}
			if scenario == "duplicate game" {
				second.Game.DatabaseID = first.Game.DatabaseID
			}
			if scenario == "existing table" {
				tables.Set(second.ID, second)
			}
			secondData, err := encodeTableSnapshot(second)
			if err != nil {
				t.Fatal(err)
			}
			if scenario == "malformed later file" {
				secondData = []byte(`{"Game":`)
			}
			for filename, data := range map[string][]byte{"42.json": firstData, "43.json": secondData} {
				if err := writeTableSnapshot(filepath.Join(tablesPath, filename), data); err != nil {
					t.Fatal(err)
				}
			}
			if err := restoreTables(); err == nil {
				t.Fatal("invalid snapshot set was accepted")
			}
			if _, exists := tables.Get(first.ID, true); exists || len(tables.playing) != 0 {
				t.Fatal("failed restoration published a partial table set")
			}
			for filename, want := range map[string][]byte{"42.json": firstData, "43.json": secondData} {
				got, err := os.ReadFile(filepath.Join(tablesPath, filename))
				if err != nil || string(got) != string(want) {
					t.Fatalf("failed restoration consumed or changed %s: %v", filename, err)
				}
			}
			if scenario == "malformed later file" {
				repaired, err := encodeTableSnapshot(second)
				if err != nil {
					t.Fatal(err)
				}
				if err := writeTableSnapshot(filepath.Join(tablesPath, "43.json"), repaired); err != nil {
					t.Fatal(err)
				}
				if err := restoreTables(); err != nil {
					t.Fatal(err)
				}
				if len(tables.GetList(true)) != 2 || len(tables.playing[1]) != 2 {
					t.Fatal("repair did not recover every table and player relationship")
				}
				for _, filename := range []string{"42.json", "43.json"} {
					if _, err := os.Stat(filepath.Join(tablesPath, filename)); !os.IsNotExist(err) {
						t.Fatalf("successful restoration did not consume %s: %v", filename, err)
					}
				}
			}
		})
	}
}

func TestSaveTablesReportsRetirementWithoutAttemptingSave(t *testing.T) {
	for _, unavailable := range []bool{false, true} {
		t.Run(map[bool]string{false: "missing store", true: "unavailable store"}[unavailable], func(t *testing.T) {
			store := injectMemoryRecovery(t)
			if unavailable {
				store.err = errors.New("storage unavailable")
				store.beforeSave = func() { t.Error("retired endpoint attempted a save") }
			} else {
				recoveryStore = nil
			}
			oldTables := tables
			tables = NewTables()
			t.Cleanup(func() { tables = oldTables })
			table := snapshotTestTable()
			table.Game = nil // Emergency handlers cannot safely inspect an incomplete transition.
			tables.Set(table.ID, table)
			lockContext := NewMiscContext("retiredSaveTest")
			table.Lock(lockContext)
			response := httptest.NewRecorder()
			ctx, _ := gin.CreateTestContext(response)
			httpLocalhostSaveTables(ctx)
			table.Unlock(lockContext)
			body := response.Body.String()
			if response.Code != http.StatusGone || !strings.Contains(body, "no save was performed") ||
				!strings.Contains(body, "/gracefulRestart") || strings.Contains(body, "success") {
				t.Fatalf("retired save response = %d %q", response.Code, body)
			}
		})
	}
}
