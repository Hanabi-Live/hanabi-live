package main

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

// If calls to the database fail for whatever reason,
// it is possible for tables to be created with no people in them
// So we allow an administrator to clear them manually
func httpLocalhostClearEmptyTables(c *gin.Context) {
	tablesMutex.Lock()
	defer tablesMutex.Unlock()

	// First, make a slice of all of the map keys
	// (so that we are not iterating over the map while simultaneously removing things from it)
	tableIDs := make([]uint64, 0, len(tables))
	for tableID := range tables {
		tableIDs = append(tableIDs, tableID)
	}

	for _, tableID := range tableIDs {
		var t *Table
		if v, ok := tables[tableID]; !ok {
			logger.Error("Failed to get the table with ID " + strconv.FormatUint(tableID, 10) + ".")
			continue
		} else {
			t = v
		}

		if !t.Running && len(t.Players) == 0 {
			// A table that has not started yet (e.g. pregame)
			deleteTable(t)
			logger.Info("Successfully cleared pregame table #" + strconv.FormatUint(t.ID, 10) + ".")
		} else if t.Replay && len(t.Spectators) == 0 {
			// A replay or shared replay
			deleteTable(t)
			logger.Info("Successfully cleared replay table #" + strconv.FormatUint(t.ID, 10) + ".")
		}
		// (don't do anything for ongoing games)
	}

	c.String(http.StatusOK, "success\n")
}
