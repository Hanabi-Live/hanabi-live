package main

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v4/pgxpool"
)

// TestLobbyHistoryPostgresIntegration uses the actual SQL model against PostgreSQL.
// Set CHAT_HISTORY_TEST_DSN to a test database with install/database_schema.sql loaded.
// It creates an isolated temporary chat_log; permanent rows are not modified.
func TestLobbyHistoryPostgresIntegration(t *testing.T) {
	dsn := os.Getenv("CHAT_HISTORY_TEST_DSN")
	if dsn == "" {
		t.Skip("PostgreSQL integration credentials are not set")
	}
	ctx := context.Background()
	config, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		t.Fatal(err)
	}
	// Keep all queries on one connection so the session-local table is visible.
	config.MaxConns = 1
	pool, err := pgxpool.ConnectConfig(ctx, config)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()

	// Preserve the real schema and indexes while isolating our test fixtures.
	if _, err := pool.Exec(ctx, "CREATE TEMP TABLE chat_log (LIKE public.chat_log INCLUDING ALL)"); err != nil {
		t.Fatal(err)
	}

	originalDB := db
	db = pool
	defer func() {
		db = originalDB
	}()

	model := &ChatLog{}
	ids := make([]int, 0, 7)
	insert := func(room string, deleted bool, timestamp string) int {
		t.Helper()
		var id int
		var deletedTime interface{}
		if deleted {
			deletedTime = time.Now()
		}
		err := db.QueryRow(ctx, `
			INSERT INTO chat_log (user_id, source, message, room, datetime_sent, deleted_at)
			VALUES (101, 'user', $1, $2, $3, $4) RETURNING id
		`, "message-"+timestamp, room, timestamp, deletedTime).Scan(&id)
		if err != nil {
			t.Fatal(err)
		}
		return id
	}

	// Deliberately insert timestamps out of order: the stable cursor is the ID.
	ids = append(ids, insert("lobby", false, "2027-01-01T00:00:00Z"))
	ids = append(ids, insert("lobby", false, "2020-01-01T00:00:00Z"))
	deletedID := insert("lobby", true, "2022-01-01T00:00:00Z")
	otherRoomID := insert("table321", false, "2026-01-01T00:00:00Z")
	ids = append(ids, insert("lobby", false, "2021-01-01T00:00:00Z"))
	ids = append(ids, insert("lobby", false, "2024-01-01T00:00:00Z"))
	ids = append(ids, insert("lobby", false, "2023-01-01T00:00:00Z"))
	ids = append(ids, insert("lobby", false, "2025-01-01T00:00:00Z"))

	first, hasMore, err := model.GetHistory("lobby", 2, 0)
	if err != nil || !hasMore || len(first) != 2 {
		t.Fatalf("first page: rows=%v, hasMore=%v, err=%v", first, hasMore, err)
	}
	if first[0].ID != ids[5] || first[1].ID != ids[4] {
		t.Fatalf("first page must be newest two IDs (not timestamp-sorted): %+v", first)
	}
	if first[0].ID == otherRoomID || first[0].ID == deletedID {
		t.Fatal("Other rooms and tombstones must be excluded")
	}

	second, secondMore, err := model.GetHistory("lobby", 2, first[len(first)-1].ID)
	if err != nil || !secondMore || len(second) != 2 {
		t.Fatalf("second page: rows=%v, hasMore=%v, err=%v", second, secondMore, err)
	}
	if second[0].ID != ids[3] || second[1].ID != ids[2] {
		t.Fatalf("second page cursor mismatch: %+v", second)
	}

	third, thirdMore, err := model.GetHistory("lobby", 2, second[len(second)-1].ID)
	if err != nil || thirdMore || len(third) != 2 {
		t.Fatalf("last page: rows=%v hasMore=%v err=%v", third, thirdMore, err)
	}
	if third[0].ID != ids[1] || third[1].ID != ids[0] {
		t.Fatalf("last page cursor mismatch: %+v", third)
	}

	empty, more, err := model.GetHistory("lobby", 2, third[len(third)-1].ID)
	if err != nil || more || len(empty) != 0 {
		t.Fatalf("past the oldest message: rows=%v hasMore=%v err=%v", empty, more, err)
	}
	wire := lobbyHistoryToWire("lobby", first)
	if len(wire) != 2 || wire[0].ChatID != ids[4] || wire[1].ChatID != ids[5] {
		t.Fatalf("Wire page must be chronological, database page newest-first: %+v", wire)
	}
}
