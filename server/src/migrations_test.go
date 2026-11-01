package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v4"
	"github.com/jackc/pgx/v4/pgxpool"
)

func TestMigrationFileVersions(t *testing.T) {
	for _, test := range []struct {
		name  string
		files []string
		want  int
	}{
		{"empty", nil, 0},
		{"ordered", []string{"002_second.sql", "001_first.sql"}, 2},
		{"missing prefix", []string{"unversioned.sql"}, -1},
		{"zero", []string{"000_zero.sql"}, -1},
		{"gap", []string{"001_first.sql", "003_gap.sql"}, -1},
		{"duplicate", []string{"001_first.sql", "0001_duplicate.sql"}, -1},
	} {
		t.Run(test.name, func(t *testing.T) {
			dir := t.TempDir()
			for _, name := range test.files {
				if err := os.WriteFile(filepath.Join(dir, name), []byte("SELECT 1;"), 0600); err != nil {
					t.Fatal(err)
				}
			}
			got, err := expectedSchemaVersion(dir)
			if (err != nil) != (test.want < 0) || (err == nil && got != test.want) {
				t.Fatalf("migration version = %d, %v; want %d", got, err, test.want)
			}
			if runtime.GOOS == "windows" {
				return
			}
			helper := filepath.Join("..", "..", "install", "migration_files.sh")
			cmd := exec.Command("bash", "-c", `source "$1"; get_migration_version "$2"`, "--", helper, dir)
			output, err := cmd.CombinedOutput()
			if (err != nil) != (test.want < 0) ||
				(err == nil && strings.TrimSpace(string(output)) != strconv.Itoa(test.want)) {
				t.Fatalf("shell migration version = %s, %v; want %d", output, err, test.want)
			}
		})
	}
}

func TestMigrationScriptRejectsDownSections(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("Shell integration requires the Unix toolchain.")
	}
	dir := t.TempDir()
	data := []byte("SELECT 1;\n---- create above / drop below ----\nSELECT 2;\n")
	if err := os.WriteFile(filepath.Join(dir, "001_probe.sql"), data, 0600); err != nil {
		t.Fatal(err)
	}
	helper := filepath.Join("..", "..", "install", "migration_files.sh")
	cmd := exec.Command("bash", "-c", `source "$1"; get_migration_version "$2"`, "--", helper, dir)
	if output, err := cmd.CombinedOutput(); err == nil || !strings.Contains(string(output), "Down migrations") {
		t.Fatalf("down migration was not rejected: %s, %v", output, err)
	}
}

func newMigrationTestDatabase(t *testing.T) (*database, *pgxpool.Config) {
	t.Helper()
	admin := newIntegrationDatabase(t, defaultDatabaseTimeout)
	var random [8]byte
	if _, err := rand.Read(random[:]); err != nil {
		t.Fatal(err)
	}
	name := "hanabi_migration_test_" + hex.EncodeToString(random[:])
	identifier := pgx.Identifier{name}.Sanitize()
	if _, err := admin.Exec(context.Background(), "CREATE DATABASE "+identifier); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if _, err := admin.Exec(context.Background(), "DROP DATABASE "+identifier); err != nil {
			t.Errorf("failed to remove isolated test database: %v", err)
		}
	})
	config, err := pgxpool.ParseConfig(os.Getenv("HANABI_TEST_DATABASE_URL"))
	if err != nil {
		t.Fatal(err)
	}
	config.ConnConfig.Database = name
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	pool, err := pgxpool.ConnectConfig(ctx, config)
	if err != nil {
		t.Fatal(err)
	}
	database := newDatabase(pool, defaultDatabaseTimeout)
	t.Cleanup(database.Close)
	return database, config
}

func migrationTestDirectory(t *testing.T, config *pgxpool.Config) (string, []string) {
	t.Helper()
	root := t.TempDir()
	install := filepath.Join(root, "install")
	if err := os.MkdirAll(filepath.Join(install, "migrations"), 0700); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"migrate.sh", "migration_files.sh", "install_database_schema.sh", "schema_version.sql"} {
		data, err := os.ReadFile(filepath.Join("..", "..", "install", name))
		if err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(install, name), data, 0700); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.WriteFile(filepath.Join(root, ".env"), nil, 0600); err != nil {
		t.Fatal(err)
	}
	env := append(os.Environ(),
		"DB_HOST="+config.ConnConfig.Host,
		"DB_PORT="+strconv.Itoa(int(config.ConnConfig.Port)),
		"DB_USER="+config.ConnConfig.User,
		"DB_PASSWORD="+config.ConnConfig.Password,
		"DB_NAME="+config.ConnConfig.Database,
	)
	return install, env
}

func runMigrationScript(t *testing.T, install string, env []string, name string, args ...string) error {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	commandArgs := append([]string{filepath.Join(install, name)}, args...)
	cmd := exec.CommandContext(ctx, "bash", commandArgs...)
	cmd.Env = env
	output, err := cmd.CombinedOutput()
	if err != nil {
		t.Logf("%s failed: %s", name, output)
	}
	return err
}

func TestTrackedMigrationsApplyOnceAndCheckStartup(t *testing.T) {
	database, config := newMigrationTestDatabase(t)
	install, env := migrationTestDirectory(t, config)
	file := filepath.Join(install, "migrations", "001_probe.sql")
	if err := os.WriteFile(file, []byte("CREATE TABLE migration_probe (value INTEGER); INSERT INTO migration_probe VALUES (42);"), 0600); err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	if err := verifySchemaVersion(ctx, database, 1); err == nil {
		t.Fatal("startup accepted unapplied migrations")
	}
	results := make(chan error, 2)
	for i := 0; i < cap(results); i++ {
		go func() {
			results <- runMigrationScript(t, install, env, "migrate.sh", "apply")
		}()
	}
	for i := 0; i < cap(results); i++ {
		if err := <-results; err != nil {
			t.Error(err)
		}
	}
	if err := runMigrationScript(t, install, env, "migrate.sh", "apply"); err != nil {
		t.Fatal(err)
	}
	if err := verifySchemaVersion(ctx, database, 1); err != nil {
		t.Fatal(err)
	}
	var count int
	if err := database.QueryRow(ctx, "SELECT COUNT(*) FROM migration_probe").Scan(&count); err != nil || count != 1 {
		t.Fatalf("migration was not applied exactly once: rows=%d, error=%v", count, err)
	}
	if err := verifySchemaVersion(ctx, database, 2); err == nil {
		t.Fatal("startup accepted a schema behind the application")
	}
	if _, err := database.Exec(ctx, "UPDATE public.schema_version SET version = 2"); err != nil {
		t.Fatal(err)
	}
	if err := verifySchemaVersion(ctx, database, 1); err != nil {
		t.Fatal("an older binary rejected a newer schema:", err)
	}
	if _, err := database.Exec(ctx, "INSERT INTO public.schema_version VALUES (3)"); err != nil {
		t.Fatal(err)
	}
	if err := verifySchemaVersion(ctx, database, 1); err == nil {
		t.Fatal("startup accepted an ambiguous schema version")
	}
}

func TestTrackedMigrationFailureRollsBack(t *testing.T) {
	database, config := newMigrationTestDatabase(t)
	install, env := migrationTestDirectory(t, config)
	file := filepath.Join(install, "migrations", "001_failure.sql")
	if err := os.WriteFile(file, []byte("CREATE TABLE failed_migration (id INTEGER); SELECT 1 / 0;"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := runMigrationScript(t, install, env, "migrate.sh", "apply"); err == nil {
		t.Fatal("a failing migration was reported as successful")
	}
	var absent bool
	if err := database.QueryRow(context.Background(), "SELECT to_regclass('public.failed_migration') IS NULL").Scan(&absent); err != nil || !absent {
		t.Fatalf("failed migration was not rolled back: %v, %v", absent, err)
	}
	if err := verifySchemaVersion(context.Background(), database, 1); err == nil {
		t.Fatal("failed migration advanced the schema version")
	}
}

func TestContainerSchemaVersionInitialization(t *testing.T) {
	database, config := newMigrationTestDatabase(t)
	dir := t.TempDir()
	helpers := filepath.Join(dir, "helpers")
	if err := os.MkdirAll(filepath.Join(helpers, "migrations"), 0700); err != nil {
		t.Fatal(err)
	}
	for _, file := range []struct{ source, destination string }{
		{"migration_files.sh", filepath.Join(helpers, "migration_files.sh")},
		{"schema_version.sql", filepath.Join(helpers, "schema_version.sql")},
		{"docker_schema_version.sh", filepath.Join(dir, "002_schema_version.sh")},
	} {
		data, err := os.ReadFile(filepath.Join("..", "..", "install", file.source))
		if err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(file.destination, data, 0700); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.WriteFile(filepath.Join(helpers, "migrations", "001_probe.sql"), []byte("SELECT 1;"), 0600); err != nil {
		t.Fatal(err)
	}
	env := append(os.Environ(),
		"PGHOST="+config.ConnConfig.Host,
		"PGPORT="+strconv.Itoa(int(config.ConnConfig.Port)),
		"PGPASSWORD="+config.ConnConfig.Password,
		"POSTGRES_USER="+config.ConnConfig.User,
		"POSTGRES_DB="+config.ConnConfig.Database,
	)
	if err := runMigrationScript(t, dir, env, "002_schema_version.sh"); err != nil {
		t.Fatal(err)
	}
	if err := verifySchemaVersion(context.Background(), database, 1); err != nil {
		t.Fatal(err)
	}
}

func TestCompleteSchemaInitialization(t *testing.T) {
	database, config := newMigrationTestDatabase(t)
	install, env := migrationTestDirectory(t, config)
	schema, err := os.ReadFile(filepath.Join("..", "..", "install", "database_schema.sql"))
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(install, "database_schema.sql"), schema, 0600); err != nil {
		t.Fatal(err)
	}
	if err := runMigrationScript(t, install, env, "install_database_schema.sh"); err != nil {
		t.Fatal(err)
	}
	var initialized bool
	if err := database.QueryRow(context.Background(), `
		SELECT to_regclass('public.games') IS NOT NULL
			AND to_regclass('public.game_actions') IS NOT NULL
			AND (SELECT version = 0 FROM public.schema_version)
	`).Scan(&initialized); err != nil || !initialized {
		t.Fatalf("complete schema was not initialized: %v, %v", initialized, err)
	}
}

func TestFreshSchemaStartsAtCurrentMigrationVersion(t *testing.T) {
	database, config := newMigrationTestDatabase(t)
	install, env := migrationTestDirectory(t, config)
	schema := []byte("CREATE TABLE migration_probe (value INTEGER); INSERT INTO migration_probe VALUES (42);")
	for _, file := range []string{
		filepath.Join(install, "database_schema.sql"),
		filepath.Join(install, "migrations", "001_probe.sql"),
	} {
		if err := os.WriteFile(file, schema, 0600); err != nil {
			t.Fatal(err)
		}
	}
	if err := runMigrationScript(t, install, env, "install_database_schema.sh"); err != nil {
		t.Fatal(err)
	}
	if err := runMigrationScript(t, install, env, "migrate.sh", "apply"); err != nil {
		t.Fatal("fresh installation tried to apply migrations already included in its schema:", err)
	}
	if err := verifySchemaVersion(context.Background(), database, 1); err != nil {
		t.Fatal(err)
	}
}
