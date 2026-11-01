package main

import (
	"context"
	"io/ioutil"
	"log"
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
func restoreTables() {
	ctx := NewMiscContext("restoreTables")

	// We first acquire the tables lock so that we can safely modify the tables map
	tables.Lock(ctx)
	defer tables.Unlock(ctx)

	var files []os.FileInfo
	if v, err := ioutil.ReadDir(tablesPath); err != nil {
		log.Fatal("Failed to get the files in the \""+tablesPath+"\" directory: ", err)
		return
	} else {
		files = v
	}

	if len(files) == 0 {
		logger.Info("No previously running tables to restore.")
		return
	}

	numTablesRestored := 0
	for _, f := range files {
		if restoreTable(ctx, f) {
			numTablesRestored++
		}
	}

	// (we do not need to adjust the "tableIDCounter" variable because
	// we have logic to not allow duplicate game IDs)

	msg := "Restored " + strconv.Itoa(numTablesRestored) + " previously running table"
	if numTablesRestored >= 2 {
		msg += "s"
	}
	msg += "."
	logger.Info(msg)
}

func restoreTable(ctx context.Context, f os.FileInfo) bool {
	if f.IsDir() || !strings.HasSuffix(f.Name(), ".json") {
		return false
	}

	tablePath := path.Join(tablesPath, f.Name())
	var tableJSON []byte
	if v, err := os.ReadFile(tablePath); err != nil {
		log.Fatal("Failed to read \""+tablePath+"\":", err)
		return false
	} else {
		tableJSON = v
	}

	t, err := decodeTableSnapshot(tableJSON)
	if err != nil {
		logger.Fatal("Failed to unmarshal \"" + tablePath + "\": " + err.Error())
		return false
	}
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

	if err := os.Remove(tablePath); err != nil {
		logger.Fatal("Failed to delete \"" + tablePath + "\": " + err.Error())
	}

	t.recordActivity(ctx)

	return true
}
