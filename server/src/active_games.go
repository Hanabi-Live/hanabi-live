package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"time"

	"github.com/Hanabi-Live/hanabi-live/logger"
)

type activeGameCheckpoint struct {
	ID       int
	Revision int64
	Data     []byte
}

// Implementations are leaf storage adapters: they must never acquire table locks.
type activeGameStore interface {
	Save(context.Context, activeGameCheckpoint) error
	Load(context.Context) ([]activeGameCheckpoint, error)
	Completed(context.Context, int) (bool, error)
}

type postgresActiveGames struct{ db *database }

var recoveryStore activeGameStore

// Completion and checkpoint writes share this namespace and reserved game ID.
// cspell:ignore xact
const gameRecoveryLockSQL = "SELECT pg_advisory_xact_lock(17482, $1)"

func (s *postgresActiveGames) Save(ctx context.Context, c activeGameCheckpoint) error {
	tx, err := s.begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	// Completion uses the same transaction lock, including the first checkpoint.
	if _, err := tx.Exec(ctx, gameRecoveryLockSQL, c.ID); err != nil {
		return err
	}
	result, err := tx.Exec(ctx, `
		INSERT INTO active_games (game_id, revision, checkpoint)
		SELECT $1, $2::bigint, $3 WHERE NOT EXISTS (SELECT 1 FROM games WHERE id = $1)
		AND ($2::bigint = 1 OR EXISTS (SELECT 1 FROM active_games WHERE game_id = $1 AND revision = $2::bigint - 1))
		ON CONFLICT (game_id) DO UPDATE
		SET revision = EXCLUDED.revision, checkpoint = EXCLUDED.checkpoint
		WHERE active_games.revision = EXCLUDED.revision - 1`,
		c.ID, c.Revision, string(c.Data))
	if err != nil {
		return err
	}
	if result.RowsAffected() != 1 {
		return errors.New("active game checkpoint conflicts with durable revision or completion")
	}
	return tx.Commit(ctx)
}

func (s *postgresActiveGames) begin(ctx context.Context) (*databaseTransaction, error) {
	metrics := serverRecoveryMetrics
	// Includes pool acquisition and the BEGIN round trip, not just queued callers.
	metrics.pendingTransactions.Add(1)
	defer metrics.pendingTransactions.Add(-1)
	return s.db.Begin(ctx)
}

func (s *postgresActiveGames) Load(ctx context.Context) ([]activeGameCheckpoint, error) {
	rows, err := s.db.Query(ctx, "SELECT game_id, revision, checkpoint FROM active_games ORDER BY game_id")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	checkpoints := make([]activeGameCheckpoint, 0)
	for rows.Next() {
		var c activeGameCheckpoint
		var data string
		if err := rows.Scan(&c.ID, &c.Revision, &data); err != nil {
			return nil, err
		}
		c.Data = []byte(data)
		checkpoints = append(checkpoints, c)
	}
	return checkpoints, rows.Err()
}

func (s *postgresActiveGames) Completed(ctx context.Context, id int) (bool, error) {
	var completed bool
	err := s.db.QueryRow(ctx, "SELECT EXISTS (SELECT 1 FROM games WHERE id = $1)", id).Scan(&completed)
	return completed, err
}

func (t *Table) usesRecovery() bool {
	return !t.Replay && t.ExtraOptions != nil && !t.ExtraOptions.NoWriteToDatabase
}

func (t *Table) blockRecovery(err error) {
	if t.recoveryBlocked.CompareAndSwap(false, true) {
		serverRecoveryMetrics.frozenTables.Add(1)
	}
	t.cancelTimers()
	t.pendingEffects = nil
	logger.Error(t.GetName() + "Recovery required; table frozen: " + err.Error())
}

func (t *Table) duplicateRequest(s *Session, d *CommandData) bool {
	if d.RequestID == "" || s == nil {
		return false
	}
	if len(d.RequestID) > 128 {
		s.Warning("Request ID is too long.")
		return true
	}
	return t.ProcessedRequests[strconv.Itoa(s.UserID)+":"+d.RequestID]
}

// mutate owns one full post-transition checkpoint. Nested server-generated mutations
// (queued pauses and their chat) join it; arbitrary chat commands do not.
func (t *Table) mutate(ctx context.Context, s *Session, d *CommandData, apply func()) (ok bool) {
	if t.recoveryBlocked.Load() || t.duplicateRequest(s, d) {
		return false
	}
	if !t.usesRecovery() {
		apply()
		return true
	}
	if t.mutationActive {
		apply()
		return true
	}
	if d.NoTablesLock {
		t.blockRecovery(errors.New("checkpoint attempted with the global tables lock held"))
		return false
	}
	t.mutationActive = true
	defer func() {
		t.mutationActive = false
		if recovered := recover(); recovered != nil {
			t.blockRecovery(fmt.Errorf("mutation panic: %v", recovered))
			panic(recovered)
		}
	}()
	t.cancelTurnTimer()
	t.cancelIdleTimer()
	apply()
	if d.RequestID != "" && s != nil {
		if t.ProcessedRequests == nil {
			t.ProcessedRequests = make(map[string]bool)
		}
		t.ProcessedRequests[strconv.Itoa(s.UserID)+":"+d.RequestID] = true
	}
	savedAt := time.Now()
	if err := t.checkpoint(ctx, savedAt); err != nil {
		t.blockRecovery(err)
		if s != nil {
			s.Warning("Game progress could not be confirmed. This table is frozen until server recovery.")
		}
		return false
	}
	// The next player (or the player whose turn a note interrupted) must not pay
	// for storage latency. SavedAt lets restoration make the same adjustment.
	runningClock := t.Game.StartedTimer && !t.Game.Paused && t.Game.EndCondition == EndConditionInProgress
	if runningClock {
		t.Game.DatetimeTurnBegin = t.Game.DatetimeTurnBegin.Add(time.Since(savedAt))
	}
	t.mutationActive = false
	effects := t.pendingEffects
	t.pendingEffects = nil
	for _, effect := range effects {
		effect()
	}
	if runningClock {
		// Notes and chat also move the deadline. Publish its post-save value after
		// the transition's other messages, even if it did not originally send a clock.
		t.NotifyTime()
	}
	if t.Ending {
		t.Game.finalizeEnd(ctx, d)
	} else {
		t.scheduleIdleTimer(ctx)
		t.Game.scheduleTurnTimer(ctx)
	}
	return !t.recoveryBlocked.Load()
}

func (t *Table) checkpoint(ctx context.Context, savedAt time.Time) error {
	metrics := serverRecoveryMetrics
	started := time.Now()
	succeeded := false
	metrics.operations.start("checkpoint")
	defer func() {
		if !succeeded {
			metrics.failedCheckpoints.Add(1)
		}
		metrics.operations.finish("checkpoint", time.Since(started))
	}()
	if recoveryStore == nil || t.Game == nil || t.Game.DatabaseID <= 0 {
		return errors.New("active game recovery storage or reserved ID is missing")
	}
	data, err := encodeTableSnapshotAt(t, savedAt)
	if err != nil {
		return err
	}
	metrics.encodedBytes.Add(uint64(len(data)))
	err = recoveryStore.Save(ctx, activeGameCheckpoint{t.Game.DatabaseID, t.recoveryRevision + 1, data})
	if err != nil {
		return err
	}
	t.recoveryRevision++
	t.snapshotSavedAt = savedAt
	succeeded = true
	return nil
}

func (t *Table) afterCommit(effect func()) {
	if t.recoveryBlocked.Load() {
		return
	}
	if t.mutationActive {
		t.pendingEffects = append(t.pendingEffects, effect)
	} else {
		effect()
	}
}

func (t *Table) emit(s *Session, command string, payload interface{}) {
	if t.recoveryBlocked.Load() {
		return
	}
	// Scrubbing happens at the caller, and serialization happens NOW, not when
	// flushing: later draws/plays can change what this recipient may see.
	data, err := json.Marshal(payload)
	if err != nil {
		panic(fmt.Errorf("encode table notification: %w", err))
	}
	t.afterCommit(func() { s.Emit(command, json.RawMessage(data)) })
}

func checkpointTables(ctx context.Context) bool {
	for _, t := range tables.GetList(true) {
		t.Lock(ctx)
		if t.Running && t.usesRecovery() && !t.recoveryBlocked.Load() {
			if !t.mutate(ctx, nil, &CommandData{}, func() {
				// Persist the maintenance allowance once, not on every crash restoration.
				if t.Options.Timed && t.Game.EndCondition == EndConditionInProgress {
					for _, player := range t.Game.Players {
						player.Time += 20 * time.Second
					}
					t.NotifyTime()
				}
			}) {
				t.Unlock(ctx)
				return false
			}
		}
		t.Unlock(ctx)
	}
	return true
}
