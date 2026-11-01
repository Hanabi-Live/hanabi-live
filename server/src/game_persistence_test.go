package main

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"
)

func TestGameIDReservationDoesNotInsertGames(t *testing.T) {
	database := gamePersistenceDatabase(t)
	first, err := (&Games{}).ReserveID()
	if err != nil {
		t.Fatal(err)
	}
	second, err := (&Games{}).ReserveID()
	if err != nil {
		t.Fatal(err)
	}
	var count int
	if err := database.QueryRow(context.Background(), "SELECT COUNT(*) FROM games").Scan(&count); err != nil {
		t.Fatal(err)
	}
	if first <= 0 || second <= first || count != 0 {
		t.Fatalf("reservation reused an ID or inserted a row: %d, %d, %d", first, second, count)
	}
}

func TestGameStartReservesIDBeforePublication(t *testing.T) {
	for _, scenario := range []string{"normal", "replay", "prefetched restart", "unavailable database"} {
		t.Run(scenario, func(t *testing.T) {
			database := gamePersistenceDatabase(t)
			oldModels := models
			models = &Models{}
			t.Cleanup(func() { models = oldModels })
			table, ctx := newTimerTestTable(t)
			variants[DefaultVariantName] = table.Game.Variant
			table.Options.VariantName = DefaultVariantName
			table.Options.Timed = false
			table.ExtraOptions.SetSeedSuffix = "reserved-start"
			table.ExtraOptions.NoWriteToDatabase = scenario == "replay"
			table.Running, table.Game = false, nil
			reserved := 0
			if scenario == "prefetched restart" {
				var err error
				reserved, err = models.Games.ReserveID()
				if err != nil {
					t.Fatal(err)
				}
				table.reservedGameID = reserved
			}
			if scenario != "normal" {
				database.timeout = 50 * time.Millisecond
				for i := int32(0); i < database.pool.Config().MaxConns; i++ {
					connection, err := database.pool.Acquire(context.Background())
					if err != nil {
						t.Fatal(err)
					}
					defer connection.Release()
				}
			}
			data := &CommandData{TableID: table.ID}
			if scenario == "prefetched restart" {
				tables.Lock(ctx)
				table.Lock(ctx)
				data.NoTableLock, data.NoTablesLock = true, true
			}
			commandTableStart(ctx, NewFakeSession(1, "Alice"), data)
			if scenario == "prefetched restart" {
				table.Unlock(ctx)
				tables.Unlock(ctx)
			}
			if scenario == "unavailable database" {
				if table.Running || table.Game != nil {
					t.Fatal("game started without reserving an ID")
				}
				return
			}
			if !table.Running || table.Game == nil {
				t.Fatal("game did not start")
			}
			if scenario == "replay" {
				if table.Game.DatabaseID != 0 {
					t.Fatal("a replay allocated a new database ID")
				}
			} else if table.Game.DatabaseID <= 0 || (reserved != 0 && table.Game.DatabaseID != reserved) {
				t.Fatal("game did not retain its reserved database ID")
			}
		})
	}
}

func TestLegacySnapshotIDAssignmentSurvivesFailedStartup(t *testing.T) {
	gamePersistenceDatabase(t)
	oldTables, oldPath, oldModels := tables, tablesPath, models
	tables, tablesPath, models = NewTables(), t.TempDir(), &Models{}
	t.Cleanup(func() { tables, tablesPath, models = oldTables, oldPath, oldModels })
	table := snapshotTestTable()
	table.Game.DatabaseID = 0
	savedAt := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
	data, err := json.Marshal(struct {
		SnapshotVersion int
		SavedAt         time.Time
		*Table
	}{1, savedAt, table})
	if err != nil {
		t.Fatal(err)
	}
	filename := filepath.Join(tablesPath, "42.json")
	if err := writeTableSnapshot(filename, data); err != nil {
		t.Fatal(err)
	}
	tables.Set(table.ID, table) // Force startup to fail after assigning the legacy ID.
	var reserved int
	for attempt := 0; attempt < 2; attempt++ {
		if err := restoreTables(); err == nil {
			t.Fatal("expected an existing-table collision")
		}
		data, err := os.ReadFile(filename)
		if err != nil {
			t.Fatal(err)
		}
		restored, err := decodeTableSnapshot(data)
		if err != nil {
			t.Fatal(err)
		}
		if restored.Game.DatabaseID <= 0 || !restored.snapshotSavedAt.Equal(savedAt) {
			t.Fatal("legacy upgrade lost the reserved ID or changed the clock checkpoint")
		}
		if attempt == 1 && restored.Game.DatabaseID != reserved {
			t.Fatal("retry allocated a different game ID")
		}
		reserved = restored.Game.DatabaseID
	}
}

func TestHistoryUsesCompletionOrderNotReservedIDOrder(t *testing.T) {
	database := gamePersistenceDatabase(t)
	oldVariantIDs := variantIDMap
	variantIDMap = map[int]string{0: DefaultVariantName}
	t.Cleanup(func() { variantIDMap = oldVariantIDs })
	if _, err := database.Exec(context.Background(), `
		INSERT INTO users (id, username, normalized_username, password_hash, last_ip)
		VALUES (1, 'Alice', 'alice', 'unused-test-hash', '127.0.0.1'),
			(2, 'Bob', 'bob', 'unused-test-hash', '127.0.0.1'),
			(3, 'Cathy', 'cathy', 'unused-test-hash', '127.0.0.1')
	`); err != nil {
		t.Fatal(err)
	}
	var ids []int
	for i := 0; i < 3; i++ {
		row := gamePersistenceRow(t)
		if i == 0 {
			row.DatetimeFinished = row.DatetimeFinished.Add(time.Hour)
		}
		tx, err := database.Begin(context.Background())
		if err != nil {
			t.Fatal(err)
		}
		defer tx.Rollback(context.Background())
		if _, err := (&Games{}).InsertTx(tx, row); err != nil {
			t.Fatal(err)
		}
		otherUser := 3
		if i == 2 {
			otherUser = 1
		}
		if err := (&GameParticipants{}).BulkInsertTx(tx, []*GameParticipantsRow{
			{GameID: row.ID, UserID: 2, Seat: 0},
			{GameID: row.ID, UserID: otherUser, Seat: 1},
		}); err != nil {
			t.Fatal(err)
		}
		if err := tx.Commit(context.Background()); err != nil {
			t.Fatal(err)
		}
		ids = append(ids, row.ID)
	}
	want := []int{ids[0], ids[2], ids[1]}
	got, err := (&Games{}).GetGameIDsUser(2, 0, 0)
	if err != nil || !reflect.DeepEqual(got, want) {
		t.Fatalf("user history = %v, %v; want %v", got, err, want)
	}
	got, err = (&Games{}).GetGameIDsFriends(1, map[int]struct{}{2: {}}, 0, 10)
	if err != nil || !reflect.DeepEqual(got, []int{ids[0], ids[1]}) {
		t.Fatalf("friends history = %v, %v", got, err)
	}
	history, err := (&Games{}).GetHistory(ids)
	if err != nil {
		t.Fatal(err)
	}
	got = nil
	for _, game := range history {
		got = append(got, game.ID)
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("history details = %v; want %v", got, want)
	}
	history, err = (&Games{}).GetHistoryCustomSort(ids, "seed")
	if err != nil {
		t.Fatal(err)
	}
	got = nil
	for _, game := range history {
		got = append(got, game.ID)
	}
	if !reflect.DeepEqual(got, []int{ids[1], ids[2], ids[0]}) {
		t.Fatalf("equal-score standings no longer reward the earliest completion: %v", got)
	}
}

func gamePersistenceDatabase(t *testing.T) *database {
	t.Helper()
	database, _ := newMigrationTestDatabase(t)
	schema, err := os.ReadFile(filepath.Join("..", "..", "install", "database_schema.sql"))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := database.Exec(context.Background(), string(schema)); err != nil {
		t.Fatal(err)
	}
	oldVariants := variants
	oldDB := db
	db = database
	variants = map[string]*Variant{DefaultVariantName: {ID: 0, Name: DefaultVariantName, MaxScore: 25}}
	t.Cleanup(func() { variants, db = oldVariants, oldDB })
	return database
}

func gamePersistenceRow(t *testing.T) GameRow {
	t.Helper()
	id, err := (&Games{}).ReserveID()
	if err != nil {
		t.Fatal(err)
	}
	options := NewOptions()
	options.NumPlayers = 2
	return GameRow{
		ID: id, Name: "Persistence test", Options: options,
		Seed: "p2v0s1", Score: 1, NumTurns: 2, EndCondition: EndConditionNormal,
		DatetimeStarted:  time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC),
		DatetimeFinished: time.Date(2026, 1, 1, 12, 5, 0, 0, time.UTC),
	}
}

func TestGameInsertRetriesShareOneCommittedResult(t *testing.T) {
	database := gamePersistenceDatabase(t)
	row := gamePersistenceRow(t)
	type outcome struct {
		result GameInsertResult
		err    error
	}
	results := make(chan outcome, 2)
	for i := 0; i < cap(results); i++ {
		go func() {
			tx, err := database.Begin(context.Background())
			if err != nil {
				results <- outcome{err: err}
				return
			}
			defer tx.Rollback(context.Background())
			result, err := (&Games{}).InsertTx(tx, row)
			if err == nil {
				err = tx.Commit(context.Background())
			}
			results <- outcome{result, err}
		}()
	}
	var id, inserted int
	for i := 0; i < cap(results); i++ {
		outcome := <-results
		if outcome.err != nil {
			t.Error(outcome.err)
			continue
		}
		if id != 0 && id != outcome.result.ID {
			t.Error("retries produced different database IDs")
		}
		id = outcome.result.ID
		if outcome.result.Inserted {
			inserted++
		}
	}
	if inserted != 1 {
		t.Fatalf("inserted %d games for one reserved ID", inserted)
	}

	tx, err := database.Begin(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(context.Background())
	retry := row
	retry.DatetimeFinished = row.DatetimeFinished.Add(time.Hour)
	result, err := (&Games{}).InsertTx(tx, retry)
	if err != nil || result.Inserted || result.ID != id || !result.DatetimeFinished.Equal(row.DatetimeFinished) {
		t.Fatalf("retry did not preserve the committed result: %+v, %v", result, err)
	}
	retry.Score++
	if _, err := (&Games{}).InsertTx(tx, retry); err == nil || !strings.Contains(err.Error(), "conflicts") {
		t.Fatalf("a conflicting result was accepted: %v", err)
	}
}

func TestGameInsertCanRetryRolledBackTransaction(t *testing.T) {
	database := gamePersistenceDatabase(t)
	row := gamePersistenceRow(t)
	tx, err := database.Begin(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if _, err := (&Games{}).InsertTx(tx, row); err != nil {
		_ = tx.Rollback(context.Background())
		t.Fatal(err)
	}
	if err := tx.Rollback(context.Background()); err != nil {
		t.Fatal(err)
	}
	tx, err = database.Begin(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(context.Background())
	result, err := (&Games{}).InsertTx(tx, row)
	if err != nil || !result.Inserted {
		t.Fatalf("rolled-back game could not be retried: %+v, %v", result, err)
	}
	if err := tx.Commit(context.Background()); err != nil {
		t.Fatal(err)
	}
}

func TestGameCompletionRetryDoesNotDuplicateParticipantsOrActions(t *testing.T) {
	database := gamePersistenceDatabase(t)
	oldDB, oldModels, oldGate := db, models, incomingCommands
	t.Cleanup(func() { db, models, incomingCommands = oldDB, oldModels, oldGate })
	db, models, incomingCommands = database, &Models{}, &commandGate{}
	if _, err := db.Exec(context.Background(), `
		INSERT INTO users (id, username, normalized_username, password_hash, last_ip)
		VALUES (1, 'Alice', 'alice', 'unused-test-hash', '127.0.0.1'),
			(2, 'Bob', 'bob', 'unused-test-hash', '127.0.0.1')
	`); err != nil {
		t.Fatal(err)
	}
	table := snapshotTestTable()
	g := table.Game
	row := gamePersistenceRow(t)
	g.DatabaseID, g.Options = row.ID, row.Options
	g.DatetimeStarted, g.DatetimeFinished = row.DatetimeStarted, row.DatetimeFinished
	g.Seed, g.Score, g.Turn, g.EndCondition = row.Seed, row.Score, row.NumTurns, row.EndCondition
	g.Variant.MaxScore = 25
	g.Actions2 = []*GameAction{{Type: ActionTypePlay, Target: 0}, {Type: ActionTypeRankClue, Target: 1, Value: 1}}
	snapshot := snapshotGameDatabaseTable(table)

	incomingCommands.enter()
	first, firstErr := g.WriteDatabase(snapshot)
	second, secondErr := g.WriteDatabase(snapshot)
	incomingCommands.leave()
	incomingCommands.drain()
	if firstErr != nil || secondErr != nil || first != second {
		t.Fatalf("completion retry = %d, %d; errors = %v, %v", first, second, firstErr, secondErr)
	}
	var games, participants, actions int
	if err := database.QueryRow(context.Background(), `
		SELECT (SELECT COUNT(*) FROM games),
			(SELECT COUNT(*) FROM game_participants),
			(SELECT COUNT(*) FROM game_actions)
	`).Scan(&games, &participants, &actions); err != nil {
		t.Fatal(err)
	}
	if games != 1 || participants != 2 || actions != 2 {
		t.Fatalf("completion duplicated records: games=%d participants=%d actions=%d", games, participants, actions)
	}
}

func TestReservedIDMigrationPreservesCompletedGames(t *testing.T) {
	database, config := newMigrationTestDatabase(t)
	if _, err := database.Exec(context.Background(), `
		CREATE TABLE games (id SERIAL PRIMARY KEY, name TEXT NOT NULL);
		INSERT INTO games (name) VALUES ('legacy');
	`); err != nil {
		t.Fatal(err)
	}
	install, env := migrationTestDirectory(t, config)
	for _, name := range []string{"001_game_recovery_id.sql", "002_game_recovery_id_index.sql"} {
		data, err := os.ReadFile(filepath.Join("..", "..", "install", "migrations", name))
		if err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(install, "migrations", name), data, 0600); err != nil {
			t.Fatal(err)
		}
	}
	if err := runMigrationScript(t, install, env, "migrate.sh", "apply"); err != nil {
		t.Fatal(err)
	}
	var legacyPreserved bool
	if err := database.QueryRow(context.Background(), `
		SELECT name = 'legacy' AND recovery_id IS NULL FROM games WHERE id = 1
	`).Scan(&legacyPreserved); err != nil || !legacyPreserved {
		t.Fatalf("legacy game changed: %v, %v", legacyPreserved, err)
	}
	recoveryID := "9c262643-43d4-44f4-ad91-9b000014de20"
	if _, err := database.Exec(context.Background(), "INSERT INTO games (name, recovery_id) VALUES ('new', $1)", recoveryID); err != nil {
		t.Fatal(err)
	}
	if _, err := database.Exec(context.Background(), "INSERT INTO games (name, recovery_id) VALUES ('duplicate', $1)", recoveryID); err == nil {
		t.Fatal("migration did not enforce recovery ID uniqueness")
	}
	if err := verifySchemaVersion(context.Background(), database, 2); err != nil {
		t.Fatal(err)
	}
	migration, err := os.ReadFile(filepath.Join("..", "..", "install", "migrations", "003_reserved_game_ids.sql"))
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(install, "migrations", "003_reserved_game_ids.sql"), migration, 0600); err != nil {
		t.Fatal(err)
	}
	if err := runMigrationScript(t, install, env, "migrate.sh", "apply"); err != nil {
		t.Fatal(err)
	}
	var retained, columns, indexes int
	if err := database.QueryRow(context.Background(), `
		SELECT (SELECT COUNT(*) FROM games WHERE (id = 1 AND name = 'legacy') OR (id = 2 AND name = 'new')),
			(SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'games' AND column_name = 'recovery_id'),
			(SELECT COUNT(*) FROM pg_indexes WHERE indexname = 'games_index_recovery_id')
	`).Scan(&retained, &columns, &indexes); err != nil {
		t.Fatal(err)
	}
	if retained != 2 || columns != 0 || indexes != 0 {
		t.Fatalf("migration changed completed games or retained UUID storage: %d, %d, %d", retained, columns, indexes)
	}
	if err := verifySchemaVersion(context.Background(), database, 3); err != nil {
		t.Fatal(err)
	}
}
