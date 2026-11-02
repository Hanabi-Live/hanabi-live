package main

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"testing"
	"time"
)

func TestActiveGamesSurviveDatabaseBackupRestore(t *testing.T) {
	source := gamePersistenceDatabase(t)
	table := snapshotTestTable()
	id, err := (&Games{}).ReserveID()
	if err != nil {
		t.Fatal(err)
	}
	table.Game.DatabaseID = id
	table.Game.Players[0].Notes = []string{"backed-up note"}
	table.Game.Tags = map[string]int{"backed-up tag": 1}
	table.ProcessedRequests = map[string]bool{"1:backed-up-request": true}
	if err := table.checkpoint(context.Background(), time.Now()); err != nil {
		t.Fatal(err)
	}
	target, _ := newMigrationTestDatabase(t)
	archive := filepath.Join(t.TempDir(), "backup.dump")
	run := func(tool string, database *database, args ...string) {
		t.Helper()
		config := database.pool.Config().ConnConfig
		connection := []string{
			"--host=" + config.Host, "--port=" + strconv.Itoa(int(config.Port)),
			"--username=" + config.User, "--dbname=" + config.Database,
		}
		ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
		defer cancel()
		cmd := exec.CommandContext(ctx, tool, append(connection, args...)...)
		cmd.Env = append(os.Environ(), "PGPASSWORD="+config.Password)
		if output, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("%s failed: %v\n%s", tool, err, output)
		}
	}
	run("pg_dump", source, "--format=custom", "--no-owner", "--no-acl", "--file="+archive)
	run("pg_restore", target, "--exit-on-error", "--no-owner", "--no-acl", archive)

	oldDB, oldStore, oldTables, oldPath := db, recoveryStore, tables, tablesPath
	db, recoveryStore, tables, tablesPath = target, &postgresActiveGames{target}, NewTables(), t.TempDir()
	t.Cleanup(func() {
		ctx := NewMiscContext("backupCleanup")
		for _, restored := range tables.GetList(true) {
			restored.Lock(ctx)
			restored.cancelTimers()
			restored.Unlock(ctx)
		}
		db, recoveryStore, tables, tablesPath = oldDB, oldStore, oldTables, oldPath
	})
	if err := restoreTables(); err != nil {
		t.Fatal(err)
	}
	restored, ok := tables.Get(table.ID, true)
	if !ok || restored.Game.DatabaseID != id ||
		restored.Game.Players[0].Notes[0] != "backed-up note" ||
		restored.Game.Tags["backed-up tag"] != 1 ||
		!restored.ProcessedRequests["1:backed-up-request"] {
		t.Fatal("backup restoration lost active state or command receipts")
	}
	next, err := (&Games{}).ReserveID()
	if err != nil || next <= id {
		t.Fatalf("restored sequence reused an active game ID: %d, %v", next, err)
	}
	checkpoints, err := recoveryStore.Load(context.Background())
	if err != nil || len(checkpoints) != 1 {
		t.Fatalf("restoration consumed its only durable recovery copy: %v", err)
	}
}
