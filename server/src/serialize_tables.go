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

// serializeTables saves any ongoing tables to disk as JSON files so that they can be restored later
func serializeTables() bool {
	snapshotFilesMutex.Lock()
	defer snapshotFilesMutex.Unlock()

	tableList := tables.GetList(true)
	for _, t := range tableList {
		// t.Lock()
		// TODO: right now, we do not acquire the table lock so that we can save games in case of a
		// deadlock

		// Only serialize ongoing games
		if t.Running && !t.Replay {
			logger.Info("Serializing table: " + strconv.FormatUint(t.ID, 10))

			// Several fields on the Table object and the Game object are set with `json:"-"` to prevent
			// the JSON encoder from serializing them
			// Otherwise, we would have to explicitly unset some fields here to avoid circular
			// references, session data, and so forth
			var tableJSON []byte
			if v, err := encodeTableSnapshot(t); err != nil {
				logger.Error("Failed to marshal table " + strconv.FormatUint(t.ID, 10) + ": " +
					err.Error())
				return false
			} else {
				tableJSON = v
			}

			tableFilename := strconv.FormatUint(t.ID, 10) + ".json"
			tablePath := path.Join(tablesPath, tableFilename)
			if err := writeTableSnapshot(tablePath, tableJSON); err != nil {
				logger.Error("Failed to write \"" + tablePath + "\": " + err.Error())
				return false
			}
		}

		// t.Unlock()
		// TODO: right now, we do not acquire the table lock so that we can save games in case of a
		// deadlock
	}

	return true
}

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

	if len(snapshots) == 0 {
		logger.Info("No previously running tables to restore.")
		return nil
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

	tables.Lock(ctx)
	defer tables.Unlock(ctx)
	for _, snapshot := range snapshots {
		if _, exists := tables.Get(snapshot.table.ID, false); exists {
			return fmt.Errorf("table %d already exists while restoring %q", snapshot.table.ID, snapshot.filename)
		}
	}

	// Validate the entire set before changing membership, starting timers, or consuming files.
	for _, snapshot := range snapshots {
		restoreTable(ctx, snapshot.table)
	}
	for _, snapshot := range snapshots {
		if err := os.Remove(snapshot.filename); err != nil {
			return fmt.Errorf("remove restored table snapshot %q: %w", snapshot.filename, err)
		}
	}
	if err := syncSnapshotDirectory(tablesPath); err != nil {
		return fmt.Errorf("sync restored table snapshot directory: %w", err)
	}

	// (we do not need to adjust the "tableIDCounter" variable because
	// we have logic to not allow duplicate game IDs)

	msg := "Restored " + strconv.Itoa(len(snapshots)) + " previously running table"
	if len(snapshots) >= 2 {
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
