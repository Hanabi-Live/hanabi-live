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
	// First, make a slice of all of the map keys
	// (so that we are not iterating over the map while simultaneously removing things from it)
	tableIDs := make([]int, 0, len(tables))
	for tableID := range tables {
		tableIDs = append(tableIDs, tableID)
	}

	for _, tableID := range tableIDs {
		var t *Table
		if v, ok := tables[tableID]; !ok {
			logger.Error("Failed to get the table with ID " + strconv.Itoa(tableID) + ".")
			continue
		} else {
			t = v
		}

		if !t.Running {
			// A table that has not started yet (e.g. pregame)
			if len(t.Players) == 0 {
				delete(tables, tableID)
				notifyAllTableGone(t)
			}
		} else if t.Replay {
			// A replay or shared replay
			if len(t.Spectators) == 0 {
				delete(tables, tableID)
				notifyAllTableGone(t)
			}
		}
		// (don't do anything for ongoing games)
	}

	c.String(http.StatusOK, "success\n")
}
