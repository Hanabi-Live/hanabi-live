package main

import (
	"net/http"
	"runtime"
	"strconv"
	"sync"
	"time"

	"github.com/Hanabi-Live/hanabi-live/logger"
	"github.com/gin-gonic/gin"
)

var commandLatencyLimits = [...]time.Duration{
	time.Millisecond, 5 * time.Millisecond, 10 * time.Millisecond,
	50 * time.Millisecond, 100 * time.Millisecond, 500 * time.Millisecond,
	time.Second, 5 * time.Second, 10 * time.Second,
}

type commandMetric struct {
	InFlight             int64
	Completed            uint64
	TotalDurationSeconds float64
	MaxDuration          time.Duration
	Buckets              [len(commandLatencyLimits) + 1]uint64
}

type commandMetrics struct {
	mutex    sync.Mutex
	commands map[string]commandMetric
}

type commandMetricReport struct {
	InFlight             int64             `json:"inFlight"`
	Completed            uint64            `json:"completed"`
	TotalDurationSeconds float64           `json:"totalDurationSeconds"`
	MaxDurationSeconds   float64           `json:"maxDurationSeconds"`
	DurationBuckets      map[string]uint64 `json:"durationBucketsSeconds"`
}

var serverCommandMetrics = newCommandMetrics()

func newCommandMetrics() *commandMetrics {
	return &commandMetrics{commands: make(map[string]commandMetric)}
}

func (m *commandMetrics) start(command string) {
	m.mutex.Lock()
	defer m.mutex.Unlock()
	metric := m.commands[command]
	metric.InFlight++
	m.commands[command] = metric
}

func (m *commandMetrics) finish(command string, elapsed time.Duration) {
	m.mutex.Lock()
	defer m.mutex.Unlock()
	metric := m.commands[command]
	metric.InFlight--
	metric.Completed++
	metric.TotalDurationSeconds += elapsed.Seconds()
	if elapsed > metric.MaxDuration {
		metric.MaxDuration = elapsed
	}
	for i, limit := range commandLatencyLimits {
		if elapsed <= limit {
			metric.Buckets[i]++
		}
	}
	metric.Buckets[len(commandLatencyLimits)]++
	m.commands[command] = metric
}

func (m *commandMetrics) snapshot() map[string]commandMetricReport {
	m.mutex.Lock()
	defer m.mutex.Unlock()
	reports := make(map[string]commandMetricReport, len(m.commands))
	for command, metric := range m.commands {
		buckets := make(map[string]uint64, len(metric.Buckets))
		for i, limit := range commandLatencyLimits {
			buckets[strconv.FormatFloat(limit.Seconds(), 'g', -1, 64)] = metric.Buckets[i]
		}
		buckets["+Inf"] = metric.Buckets[len(commandLatencyLimits)]
		reports[command] = commandMetricReport{
			InFlight:             metric.InFlight,
			Completed:            metric.Completed,
			TotalDurationSeconds: metric.TotalDurationSeconds,
			MaxDurationSeconds:   metric.MaxDuration.Seconds(),
			DurationBuckets:      buckets,
		}
	}
	return reports
}

func httpLocalhostMetrics(c *gin.Context) {
	if db == nil {
		logger.Error("Metrics requested before the database pool was initialized.")
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Database pool is not initialized."})
		return
	}

	pool := db.Stat()
	var memory runtime.MemStats
	runtime.ReadMemStats(&memory)
	c.JSON(http.StatusOK, gin.H{
		"uptimeSeconds": time.Since(datetimeStarted).Seconds(),
		"runtime": gin.H{
			"goroutineCount": runtime.NumGoroutine(),
			"heapBytes":      memory.HeapAlloc,
			"numGC":          memory.NumGC,
		},
		"commands": serverCommandMetrics.snapshot(),
		"database": gin.H{
			"acquiredConnections":    pool.AcquiredConns(),
			"idleConnections":        pool.IdleConns(),
			"totalConnections":       pool.TotalConns(),
			"maxConnections":         pool.MaxConns(),
			"constructing":           pool.ConstructingConns(),
			"acquireCount":           pool.AcquireCount(),
			"acquireDurationSeconds": pool.AcquireDuration().Seconds(),
			"emptyAcquireCount":      pool.EmptyAcquireCount(),
			"canceledAcquireCount":   pool.CanceledAcquireCount(),
		},
	})
}
