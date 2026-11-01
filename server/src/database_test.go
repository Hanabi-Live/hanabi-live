package main

import (
	"context"
	"errors"
	"os"
	"strconv"
	"testing"
	"time"

	"github.com/jackc/pgx/v4/pgxpool"
)

func TestDatabaseTimeoutConfiguration(t *testing.T) {
	for _, value := range []string{"0", "-1", "1.5", "invalid", "2147484"} {
		if _, err := parseDatabaseTimeout(value); err == nil {
			t.Errorf("invalid timeout %q was accepted", value)
		}
	}
	for value, want := range map[string]time.Duration{"": 30 * time.Second, "1": time.Second, "60": time.Minute} {
		got, err := parseDatabaseTimeout(value)
		if err != nil || got != want {
			t.Errorf("timeout %q = %s, %v; want %s", value, got, err, want)
		}
	}
}

func TestDatabaseStatementTimeoutConfiguration(t *testing.T) {
	url := os.Getenv("HANABI_TEST_DATABASE_URL")
	if url == "" {
		t.Skip("Set HANABI_TEST_DATABASE_URL to run PostgreSQL integration tests.")
	}
	config, err := pgxpool.ParseConfig(url)
	if err != nil {
		t.Fatal(err)
	}
	t.Setenv("DB_HOST", config.ConnConfig.Host)
	t.Setenv("DB_PORT", strconv.Itoa(int(config.ConnConfig.Port)))
	t.Setenv("DB_USER", config.ConnConfig.User)
	t.Setenv("DB_PASSWORD", config.ConnConfig.Password)
	t.Setenv("DB_NAME", config.ConnConfig.Database)
	t.Setenv("DB_OPERATION_TIMEOUT_SECONDS", "2")
	oldDB, oldName := db, dbName
	t.Cleanup(func() { db, dbName = oldDB, oldName })
	model, err := modelsInit()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(model.Close)
	var setting string
	if err := db.QueryRow(context.Background(), "SHOW statement_timeout").Scan(&setting); err != nil {
		t.Fatal(err)
	}
	if setting != "2s" {
		t.Fatalf("configured statement timeout = %q, want 2s", setting)
	}
}

func newIntegrationDatabase(t *testing.T, timeout time.Duration) *database {
	t.Helper()
	url := os.Getenv("HANABI_TEST_DATABASE_URL")
	if url == "" {
		t.Skip("Set HANABI_TEST_DATABASE_URL to run PostgreSQL integration tests.")
	}
	config, err := pgxpool.ParseConfig(url)
	if err != nil {
		t.Fatal(err)
	}
	config.MinConns = 0
	config.MaxConns = 1
	config.ConnConfig.RuntimeParams["statement_timeout"] = "0"
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	pool, err := pgxpool.ConnectConfig(ctx, config)
	if err != nil {
		t.Fatal(err)
	}
	database := newDatabase(pool, timeout)
	t.Cleanup(database.Close)
	return database
}

func TestDatabaseQueryDeadlines(t *testing.T) {
	for _, operation := range []string{"exec", "query", "queryRow", "transaction"} {
		t.Run(operation, func(t *testing.T) {
			database := newIntegrationDatabase(t, 50*time.Millisecond)
			ctx := context.Background()
			var err error
			switch operation {
			case "exec":
				_, err = database.Exec(ctx, "SELECT pg_sleep(2)")
			case "query":
				rows, queryErr := database.Query(ctx, "SELECT pg_sleep(2)")
				err = queryErr
				if err == nil {
					for rows.Next() {
					}
					err = rows.Err()
					rows.Close()
				}
			case "queryRow":
				var value interface{}
				err = database.QueryRow(ctx, "SELECT pg_sleep(2)").Scan(&value)
			case "transaction":
				tx, beginErr := database.Begin(ctx)
				if beginErr != nil {
					t.Fatal(beginErr)
				}
				_, err = tx.Exec(ctx, "SELECT pg_sleep(2)")
				_ = tx.Rollback(ctx)
			}
			if !errors.Is(err, context.DeadlineExceeded) {
				t.Fatalf("slow operation returned %v, want deadline exceeded", err)
			}
		})
	}
}

func TestDatabasePoolWaitDeadline(t *testing.T) {
	database := newIntegrationDatabase(t, 50*time.Millisecond)
	ctx := context.Background()
	connection, err := database.pool.Acquire(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer connection.Release()

	var value int
	if err := database.QueryRow(ctx, "SELECT 1").Scan(&value); !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("pool wait returned %v, want deadline exceeded", err)
	}
	if _, err := database.Begin(ctx); !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("transaction pool wait returned %v, want deadline exceeded", err)
	}
}

func TestDatabaseEarlierDeadline(t *testing.T) {
	database := newIntegrationDatabase(t, time.Second)
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Millisecond)
	defer cancel()
	_, err := database.Exec(ctx, "SELECT pg_sleep(2)")
	if !errors.Is(err, context.DeadlineExceeded) || !errors.Is(ctx.Err(), context.DeadlineExceeded) {
		t.Fatalf("caller deadline was not respected: operation=%v, context=%v", err, ctx.Err())
	}
}

func TestDatabaseRowsLifecycle(t *testing.T) {
	database := newIntegrationDatabase(t, time.Second)
	ctx := context.Background()
	rows, err := database.Query(ctx, "SELECT 42")
	if err != nil {
		t.Fatal(err)
	}
	if !rows.Next() {
		t.Fatalf("query context was canceled before rows could be read: %v", rows.Err())
	}
	values, err := rows.Values()
	if err != nil || len(values) != 1 || values[0] != int32(42) {
		t.Fatalf("unexpected values: %v, %v", values, err)
	}
	if rows.Next() || rows.Err() != nil || database.Stat().AcquiredConns() != 0 {
		t.Fatalf("exhausted rows were not released cleanly: %v", rows.Err())
	}

	rows, err = database.Query(ctx, "SELECT 'not-a-number'::text")
	if err != nil || !rows.Next() {
		t.Fatalf("failed to query the invalid scan fixture: %v", err)
	}
	var value int
	if err := rows.Scan(&value); err == nil {
		t.Fatal("invalid scan unexpectedly succeeded")
	}
	if database.Stat().AcquiredConns() != 0 {
		t.Fatal("a scan error leaked its pooled connection")
	}
}

func TestDatabaseRowsDeadline(t *testing.T) {
	database := newIntegrationDatabase(t, 50*time.Millisecond)
	rows, err := database.Query(context.Background(), "SELECT generate_series(1, 2)")
	if err != nil {
		t.Fatal(err)
	}
	<-rows.(*databaseRows).ctx.Done()
	if rows.Next() || !errors.Is(rows.Err(), context.DeadlineExceeded) {
		t.Fatalf("expired row consumption returned %v", rows.Err())
	}
	if database.Stat().AcquiredConns() != 0 {
		t.Fatal("expired rows leaked their pooled connection")
	}
}

func TestDatabaseTransactionLifecycle(t *testing.T) {
	database := newIntegrationDatabase(t, time.Second)
	ctx := context.Background()
	for _, commit := range []bool{false, true} {
		tx, err := database.Begin(ctx)
		if err != nil {
			t.Fatal(err)
		}
		var value int
		if err := tx.QueryRow(ctx, "SELECT 42").Scan(&value); err != nil || value != 42 {
			_ = tx.Rollback(ctx)
			t.Fatalf("transaction did not survive Begin's context cleanup: %d, %v", value, err)
		}
		if commit {
			err = tx.Commit(ctx)
		} else {
			err = tx.Rollback(ctx)
		}
		if err != nil || database.Stat().AcquiredConns() != 0 {
			t.Fatalf("transaction did not release its connection: %v", err)
		}
	}
}
