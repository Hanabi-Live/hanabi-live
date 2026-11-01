package main

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	uuid "github.com/satori/go.uuid"
)

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
	variants = map[string]*Variant{DefaultVariantName: {ID: 0, Name: DefaultVariantName, MaxScore: 25}}
	t.Cleanup(func() { variants = oldVariants })
	return database
}

func gamePersistenceRow() GameRow {
	options := NewOptions()
	options.NumPlayers = 2
	return GameRow{
		RecoveryID: uuid.NewV4().String(), Name: "Persistence test", Options: options,
		Seed: "p2v0s1", Score: 1, NumTurns: 2, EndCondition: EndConditionNormal,
		DatetimeStarted:  time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC),
		DatetimeFinished: time.Date(2026, 1, 1, 12, 5, 0, 0, time.UTC),
	}
}

func TestGameInsertRetriesShareOneCommittedResult(t *testing.T) {
	database := gamePersistenceDatabase(t)
	row := gamePersistenceRow()
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
		t.Fatalf("inserted %d games for one recovery ID", inserted)
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
	row := gamePersistenceRow()
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
	row := gamePersistenceRow()
	g.RecoveryID, g.Options = row.RecoveryID, row.Options
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

func TestRecoveryIDMigrationsPreserveLegacyGames(t *testing.T) {
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
	recoveryID := uuid.NewV4().String()
	if _, err := database.Exec(context.Background(), "INSERT INTO games (name, recovery_id) VALUES ('new', $1)", recoveryID); err != nil {
		t.Fatal(err)
	}
	if _, err := database.Exec(context.Background(), "INSERT INTO games (name, recovery_id) VALUES ('duplicate', $1)", recoveryID); err == nil {
		t.Fatal("migration did not enforce recovery ID uniqueness")
	}
	if err := verifySchemaVersion(context.Background(), database, 2); err != nil {
		t.Fatal(err)
	}
}
