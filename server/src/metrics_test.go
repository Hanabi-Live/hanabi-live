package main

import (
	"context"
	"encoding/json"
	"errors"
	"math"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v4"
	"github.com/jackc/pgx/v4/pgxpool"
)

func TestCommandMetricsAggregation(t *testing.T) {
	metrics := newCommandMetrics()
	for _, elapsed := range []time.Duration{500 * time.Microsecond, 7 * time.Millisecond, 2 * time.Second} {
		metrics.start("action")
		metrics.finish("action", elapsed)
	}
	metrics.start("action")
	report := metrics.snapshot()["action"]
	if report.Completed != 3 || report.InFlight != 1 || report.MaxDurationSeconds != 2 ||
		math.Abs(report.TotalDurationSeconds-2.0075) > 0.000000001 {
		t.Fatalf("unexpected command metrics: %+v", report)
	}
	for bucket, want := range map[string]uint64{"0.001": 1, "0.005": 1, "0.01": 2, "1": 2, "5": 3, "+Inf": 3} {
		if got := report.DurationBuckets[bucket]; got != want {
			t.Errorf("bucket %s = %d, want %d", bucket, got, want)
		}
	}
	report.DurationBuckets["+Inf"] = 100
	if metrics.snapshot()["action"].DurationBuckets["+Inf"] != 3 {
		t.Fatal("mutating a report changed live metrics")
	}
}

func TestConcurrentCommandMetrics(t *testing.T) {
	metrics := newCommandMetrics()
	var workers sync.WaitGroup
	for i := 0; i < 8; i++ {
		workers.Add(1)
		go func() {
			defer workers.Done()
			for j := 0; j < 50; j++ {
				metrics.start("action")
				metrics.snapshot()
				metrics.finish("action", time.Millisecond)
			}
		}()
	}
	workers.Wait()
	report := metrics.snapshot()["action"]
	if report.Completed != 400 || report.InFlight != 0 || report.DurationBuckets["0.001"] != 400 {
		t.Fatalf("concurrent observations were lost: %+v", report)
	}
}

func TestLocalhostMetrics(t *testing.T) {
	oldDB, oldMetrics, oldStarted := db, serverCommandMetrics, datetimeStarted
	oldStore := recoveryStore
	t.Cleanup(func() {
		db, serverCommandMetrics, datetimeStarted, recoveryStore = oldDB, oldMetrics, oldStarted, oldStore
	})
	db = nil
	response := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(response)
	httpLocalhostMetrics(ctx)
	if response.Code != http.StatusServiceUnavailable {
		t.Fatalf("missing pool returned status %d", response.Code)
	}

	config, err := pgxpool.ParseConfig("host=127.0.0.1 port=1 user=metrics dbname=metrics sslmode=disable")
	if err != nil {
		t.Fatal(err)
	}
	config.LazyConnect = true
	config.MinConns = 0
	config.MaxConns = 2
	var connectionAttempts int32
	config.BeforeConnect = func(context.Context, *pgx.ConnConfig) error {
		atomic.AddInt32(&connectionAttempts, 1)
		return errors.New("metrics must not open database connections")
	}
	pool, err := pgxpool.ConnectConfig(context.Background(), config)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	db = newDatabase(pool, defaultDatabaseTimeout)
	recoveryConfig := config.Copy()
	recoveryConfig.MaxConns = 3
	recoveryPool, err := pgxpool.ConnectConfig(context.Background(), recoveryConfig)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(recoveryPool.Close)
	recoveryStore = &postgresActiveGames{newDatabase(recoveryPool, defaultDatabaseTimeout)}
	datetimeStarted = time.Now().Add(-time.Second)
	serverCommandMetrics = newCommandMetrics()
	serverCommandMetrics.start("tableCreate")
	serverCommandMetrics.finish("tableCreate", 10*time.Millisecond)
	response = httptest.NewRecorder()
	ctx, _ = gin.CreateTestContext(response)
	httpLocalhostMetrics(ctx)
	if response.Code != http.StatusOK {
		t.Fatalf("metrics returned status %d: %s", response.Code, response.Body.String())
	}
	var report struct {
		UptimeSeconds float64                        `json:"uptimeSeconds"`
		Commands      map[string]commandMetricReport `json:"commands"`
		Database      struct {
			MaxConnections   int32 `json:"maxConnections"`
			TotalConnections int32 `json:"totalConnections"`
		} `json:"database"`
		Recovery struct {
			StorageInitialized bool `json:"storageInitialized"`
			Database           struct {
				MaxConnections   int32 `json:"maxConnections"`
				TotalConnections int32 `json:"totalConnections"`
			} `json:"database"`
		} `json:"recovery"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &report); err != nil {
		t.Fatal(err)
	}
	if report.UptimeSeconds < 1 || report.Commands["tableCreate"].Completed != 1 ||
		report.Database.MaxConnections != 2 || report.Database.TotalConnections != 0 ||
		!report.Recovery.StorageInitialized || report.Recovery.Database.MaxConnections != 3 ||
		report.Recovery.Database.TotalConnections != 0 ||
		atomic.LoadInt32(&connectionAttempts) != 0 {
		t.Fatalf("unexpected metrics or database I/O: %+v", report)
	}
}

func TestRecoveryMetricsRecordFailuresAndOneFreezePerTable(t *testing.T) {
	table, ctx := newTimerTestTable(t)
	oldMetrics := serverRecoveryMetrics
	serverRecoveryMetrics = &recoveryMetrics{operations: newCommandMetrics()}
	t.Cleanup(func() { serverRecoveryMetrics = oldMetrics })
	store := recoveryStore.(*memoryActiveGames)
	store.beforeSave = func() {
		if serverRecoveryMetrics.operations.snapshot()["checkpoint"].InFlight != 1 {
			t.Error("checkpoint in-flight count omitted the storage operation")
		}
	}
	table.Lock(ctx)
	defer table.Unlock(ctx)
	if err := table.checkpoint(ctx, time.Now()); err != nil {
		t.Fatal(err)
	}
	store.err = errors.New("storage unavailable")
	if table.mutate(ctx, nil, &CommandData{}, func() {}) {
		t.Fatal("failed storage operation reported success")
	}
	table.blockRecovery(store.err)
	metric := serverRecoveryMetrics.operations.snapshot()["checkpoint"]
	if metric.InFlight != 0 || metric.Completed != 2 ||
		metric.DurationBuckets["+Inf"] != 2 ||
		serverRecoveryMetrics.failedCheckpoints.Load() != 1 ||
		serverRecoveryMetrics.encodedBytes.Load() == 0 ||
		serverRecoveryMetrics.frozenTables.Load() != 1 {
		t.Fatalf("recovery counters lost or duplicated observations: %+v", serverRecoveryMetrics.snapshot())
	}
}

func TestRecoveryMetricsTrackCanceledTransactionWait(t *testing.T) {
	gamePersistenceDatabase(t)
	store := recoveryStore.(*postgresActiveGames)
	oldMetrics := serverRecoveryMetrics
	serverRecoveryMetrics = &recoveryMetrics{operations: newCommandMetrics()}
	t.Cleanup(func() { serverRecoveryMetrics = oldMetrics })
	for i := int32(0); i < store.db.pool.Config().MaxConns; i++ {
		connection, err := store.db.pool.Acquire(context.Background())
		if err != nil {
			t.Fatal(err)
		}
		defer connection.Release()
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	done := make(chan error, 1)
	go func() {
		done <- store.Save(ctx, activeGameCheckpoint{ID: 1, Revision: 1, Data: []byte("{}")})
	}()
	deadline := time.NewTimer(5 * time.Second)
	defer deadline.Stop()
	tick := time.NewTicker(time.Millisecond)
	defer tick.Stop()
	for serverRecoveryMetrics.pendingTransactions.Load() != 1 {
		select {
		case <-tick.C:
		case <-deadline.C:
			cancel()
			<-done
			t.Fatal("recovery pool waiter was not reported")
		}
	}
	cancel()
	select {
	case err := <-done:
		if !errors.Is(err, context.Canceled) || serverRecoveryMetrics.pendingTransactions.Load() != 0 {
			t.Fatalf("canceled recovery wait left stale metrics: %v", err)
		}
	case <-deadline.C:
		t.Fatal("recovery transaction did not observe cancellation")
	}
}
