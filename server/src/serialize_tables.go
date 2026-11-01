package main

import (
	"context"
	"fmt"
	"os"
	"path"
	"strconv"
	"strings"
	"time"

	"github.com/Hanabi-Live/hanabi-live/logger"
)

// restoreTables recreates tables that were ongoing at the time of the last server restart
// Tables were serialized to flat files in the "tablesPath" directory
func restoreTables() error {
	ctx := NewMiscContext("restoreTables")
	snapshotFilesMutex.Lock()
	defer snapshotFilesMutex.Unlock()

	files, err := os.ReadDir(tablesPath)
	if err != nil {
		return fmt.Errorf("read table snapshot directory: %w", err)
	}

	type snapshotFile struct {
		filename string
		table    *Table
	}
	var snapshots []snapshotFile
	tableIDs := make(map[uint64]string)
	gameIDs := make(map[int]string)
	if recoveryStore == nil {
		return fmt.Errorf("active game recovery storage is not initialized")
	}
	checkpoints, err := recoveryStore.Load(ctx)
	if err != nil {
		return fmt.Errorf("load active game checkpoints: %w", err)
	}
	durable := make(map[int]*Table)
	for _, checkpoint := range checkpoints {
		table, err := decodeTableSnapshot(checkpoint.Data)
		if err != nil {
			return fmt.Errorf("decode active game %d: %w", checkpoint.ID, err)
		}
		if checkpoint.ID != table.Game.DatabaseID || checkpoint.Revision <= 0 || table.snapshotSavedAt.IsZero() {
			return fmt.Errorf("invalid active game checkpoint metadata for %d", checkpoint.ID)
		}
		if _, exists := durable[checkpoint.ID]; exists {
			return fmt.Errorf("duplicate active game %d", checkpoint.ID)
		}
		table.recoveryRevision = checkpoint.Revision
		durable[checkpoint.ID] = table
	}
	for _, file := range files {
		if file.IsDir() || !strings.HasSuffix(file.Name(), ".json") {
			continue
		}
		filename := path.Join(tablesPath, file.Name())
		data, err := os.ReadFile(filename)
		if err != nil {
			return fmt.Errorf("read table snapshot %q: %w", filename, err)
		}
		table, err := decodeTableSnapshot(data)
		if err != nil {
			return fmt.Errorf("decode table snapshot %q: %w", filename, err)
		}
		if previous, exists := tableIDs[table.ID]; exists {
			return fmt.Errorf("duplicate table ID %d in %q and %q", table.ID, previous, filename)
		}
		if previous, exists := gameIDs[table.Game.DatabaseID]; table.Game.DatabaseID != 0 && exists {
			return fmt.Errorf("duplicate reserved game ID in %q and %q", previous, filename)
		}
		tableIDs[table.ID] = filename
		gameIDs[table.Game.DatabaseID] = filename
		snapshots = append(snapshots, snapshotFile{filename, table})
	}

	// Legacy snapshots get a committed sequence value before any table locks or gameplay.
	// Persist the assignment so a failed startup cannot allocate a different ID on retry.
	for _, snapshot := range snapshots {
		if snapshot.table.Game.DatabaseID == 0 {
			id, err := models.Games.ReserveID()
			if err != nil {
				return fmt.Errorf("reserve game ID for %q: %w", snapshot.filename, err)
			}
			if previous, exists := gameIDs[id]; exists {
				return fmt.Errorf("reserved game ID %d conflicts with snapshot %q; check the games sequence", id, previous)
			}
			if _, exists := durable[id]; exists {
				return fmt.Errorf("reserved game ID %d conflicts with an active checkpoint; check the games sequence", id)
			}
			gameIDs[id] = snapshot.filename
			snapshot.table.Game.DatabaseID = id
			data, err := encodeTableSnapshotAt(snapshot.table, snapshot.table.snapshotSavedAt)
			if err != nil {
				return fmt.Errorf("encode upgraded snapshot %q: %w", snapshot.filename, err)
			}
			if err := writeTableSnapshot(snapshot.filename, data); err != nil {
				return fmt.Errorf("persist reserved game ID in %q: %w", snapshot.filename, err)
			}
		}
	}

	// Validate collisions before importing files or publishing any tables.
	all := make(map[int]*Table)
	for _, snapshot := range snapshots {
		if _, exists := tables.Get(snapshot.table.ID, true); exists {
			return fmt.Errorf("table %d already exists while restoring %q", snapshot.table.ID, snapshot.filename)
		}
		all[snapshot.table.Game.DatabaseID] = snapshot.table
	}
	for id, table := range durable {
		all[id] = table // PostgreSQL supersedes even a newer emergency flat file.
	}
	tableIDs = make(map[uint64]string)
	var active []*Table
	for id, table := range all {
		completed, err := recoveryStore.Completed(ctx, id)
		if err != nil {
			return fmt.Errorf("check completed game %d: %w", id, err)
		}
		if completed {
			continue
		}
		if previous, exists := tableIDs[table.ID]; exists {
			return fmt.Errorf("duplicate restored table ID %d (%s)", table.ID, previous)
		}
		if _, exists := tables.Get(table.ID, true); exists {
			return fmt.Errorf("table %d already exists", table.ID)
		}
		tableIDs[table.ID] = strconv.Itoa(id)
		active = append(active, table)
	}

	// Every input is now validated. Import before removing the only recovery copy.
	var running []*Table
	for _, table := range active {
		if table.recoveryRevision == 0 {
			savedAt := table.snapshotSavedAt
			if savedAt.IsZero() {
				// Original files have no clock checkpoint; do not charge unknown downtime.
				savedAt = table.Game.DatetimeTurnBegin
				if savedAt.IsZero() {
					savedAt = time.Now()
				}
			}
			if err := table.checkpoint(ctx, savedAt); err != nil {
				return fmt.Errorf("import active game %d: %w", table.Game.DatabaseID, err)
			}
		}
		if table.Game.EndCondition != EndConditionInProgress {
			if _, err := table.Game.WriteDatabase(snapshotGameDatabaseTable(table)); err != nil {
				return fmt.Errorf("finalize recovered game %d: %w", table.Game.DatabaseID, err)
			}
			continue
		}
		running = append(running, table)
	}
	for _, snapshot := range snapshots {
		if err := os.Remove(snapshot.filename); err != nil {
			return fmt.Errorf("remove restored table snapshot %q: %w", snapshot.filename, err)
		}
	}
	if err := syncSnapshotDirectory(tablesPath); err != nil {
		return fmt.Errorf("sync restored table snapshot directory: %w", err)
	}
	tables.Lock(ctx)
	for _, table := range running {
		restoreTable(ctx, table)
	}
	tables.Unlock(ctx)

	// (we do not need to adjust the "tableIDCounter" variable because
	// we have logic to not allow duplicate game IDs)

	msg := "Restored " + strconv.Itoa(len(running)) + " previously running table"
	if len(running) >= 2 {
		msg += "s"
	}
	msg += "."
	logger.Info(msg)
	return nil
}

func restoreTable(ctx context.Context, t *Table) {
	g := t.Game
	t.Lock(ctx)
	defer t.Unlock(ctx)

	for _, p := range t.Players {
		// Restore the player relationships
		tables.AddPlaying(p.UserID, t.ID)
	}

	restoreTableClock(t, time.Now())
	g.scheduleTurnTimer(ctx)

	tables.Set(t.ID, t)
	logger.Info(t.GetName() + "Restored table.")

	t.recordActivity(ctx)
}
