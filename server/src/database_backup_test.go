package main

import (
	"compress/gzip"
	"context"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"
)

func TestDatabaseBackupScriptStreamsAndCleansFailures(t *testing.T) {
	for _, tool := range []string{"bash", "gzip", "flock"} {
		if _, err := exec.LookPath(tool); err != nil {
			t.Skipf("backup script tests require %s", tool)
		}
	}
	script, err := os.ReadFile("../../database_backup.sh")
	if err != nil {
		t.Fatal(err)
	}
	for _, test := range []struct {
		name        string
		availableKB string
		dumpFails   bool
		gzipFails   bool
		wantSuccess bool
	}{
		{"stream and retain newest under disk pressure", "2097152", false, false, true},
		{"failed dump removes partial gzip", "2097152", true, false, false},
		{"failed compression removes partial gzip", "2097152", false, true, false},
		{"size limit preserves disk reserve", "1048577", false, false, false},
		{"low space refuses to start", "1048576", false, false, false},
	} {
		t.Run(test.name, func(t *testing.T) {
			root := filepath.Join(t.TempDir(), "backup-test")
			bin := filepath.Join(root, "bin")
			backups := filepath.Join(root, "backups")
			for _, directory := range []string{bin, backups} {
				if err := os.MkdirAll(directory, 0700); err != nil {
					t.Fatal(err)
				}
			}
			write := func(name, contents string, mode os.FileMode) {
				t.Helper()
				if err := os.WriteFile(filepath.Join(root, name), []byte(contents), mode); err != nil {
					t.Fatal(err)
				}
			}
			write("database_backup.sh", string(script), 0700)
			write(".env", "DB_HOST=localhost\nDB_PORT=5432\nDB_USER=fixture\nDB_PASSWORD=fixture\nDB_NAME=fixture\nGOOGLE_DRIVE_SERVICE_ACCOUNT_FILENAME=\nGOOGLE_DRIVE_PARENT_DIRECTORY_ID=\n", 0600)
			write("bin/logger", "#!/bin/sh\ncat\n", 0700)
			write("bin/uname", "#!/bin/sh\necho Linux\n", 0700)
			write("bin/date", "#!/bin/sh\necho 1234\n", 0700)
			write("bin/df", "#!/bin/sh\nprintf 'Filesystem 1024-blocks Used Available Capacity Mounted\\nfixture 20000000 1 "+test.availableKB+" 91%% /\\n'\n", 0700)
			dump := "#!/bin/sh\nfor file in \"$PWD/backups/\"*.sql; do\n  if [ -f \"$file\" ]; then echo 'Unexpected uncompressed dump' >&2; exit 2; fi\ndone\ncat \"$PWD/payload\"\n"
			if test.dumpFails {
				dump += "exit 1\n"
			}
			write("bin/pg_dump", dump, 0700)
			if test.gzipFails {
				write("bin/gzip", "#!/bin/sh\nexit 1\n", 0700)
			}
			var payload strings.Builder
			for i := 0; i < 2000; i++ {
				payload.WriteString("INSERT INTO example VALUES (" + strconv.Itoa(i) + ");\n")
			}
			write("payload", payload.String(), 0600)
			write("backups/backup-test-1.sql.gz", "previous completed backup", 0600)
			write("backups/unrelated.txt", "do not remove", 0600)

			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			command := exec.CommandContext(ctx, "bash", "database_backup.sh")
			command.Dir = root
			command.Env = append(os.Environ(), "PATH="+bin+string(os.PathListSeparator)+os.Getenv("PATH"))
			output, err := command.CombinedOutput()
			if ctx.Err() != nil {
				t.Fatalf("backup did not terminate: %v\n%s", ctx.Err(), output)
			}
			if (err == nil) != test.wantSuccess {
				t.Fatalf("unexpected backup result: %v\n%s", err, output)
			}
			entries, err := os.ReadDir(backups)
			if err != nil {
				t.Fatal(err)
			}
			for _, entry := range entries {
				if strings.HasSuffix(entry.Name(), ".partial") || strings.HasSuffix(entry.Name(), ".sql") {
					t.Fatalf("incomplete backup was left behind: %s", entry.Name())
				}
			}
			if _, err := os.Stat(filepath.Join(backups, "unrelated.txt")); err != nil {
				t.Fatal("backup cleanup removed an unrelated file", err)
			}
			finalPath := filepath.Join(backups, "backup-test-1234.sql.gz")
			if !test.wantSuccess {
				if _, err := os.Stat(finalPath); !os.IsNotExist(err) {
					t.Fatal("failed backup was published", err)
				}
				if _, err := os.Stat(filepath.Join(backups, "backup-test-1.sql.gz")); err != nil {
					t.Fatal("failed backup removed the previous backup", err)
				}
				return
			}
			if _, err := os.Stat(filepath.Join(backups, "backup-test-1.sql.gz")); !os.IsNotExist(err) {
				t.Fatal("older backup was not pruned under disk pressure", err)
			}
			file, err := os.Open(finalPath)
			if err != nil {
				t.Fatal("newest completed backup was deleted", err)
			}
			defer file.Close()
			reader, err := gzip.NewReader(file)
			if err != nil {
				t.Fatal(err)
			}
			defer reader.Close()
			restored, err := io.ReadAll(reader)
			if err != nil || string(restored) != payload.String() {
				t.Fatal("compressed backup did not preserve the dump", err)
			}
		})
	}
}

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
