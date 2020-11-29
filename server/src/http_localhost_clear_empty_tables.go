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
	tableIDs := tables.GetKeys()
	for _, tableID := range tableIDs {
		t, exists := getTableAndLock(c, nil, tableID, true)
		if !exists {
			logger.Error("Failed to get the table with ID " + strconv.FormatUint(tableID, 10) + ".")
			continue
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

		t.Unlock(c)
	}

	c.String(http.StatusOK, "success\n")
}
