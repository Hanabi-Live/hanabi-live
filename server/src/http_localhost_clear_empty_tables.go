package main

import (
	"net/http"
	"strconv"

	"github.com/Hanabi-Live/hanabi-live/logger"
	"github.com/gin-gonic/gin"
)

// If calls to the database fail for whatever reason,
// it is possible for tables to be created with no people in them
// So we allow an administrator to clear them manually
func httpLocalhostClearEmptyTables(c *gin.Context) {
	// Since this is a function that changes a user's relationship to tables,
	// we must acquires the tables lock to prevent race conditions
	tables.Lock(c)
	defer tables.Unlock(c)

	for _, t := range tables.GetList(false) {
		t.Lock(c)
		if !t.Deleted {
			if !t.Running && len(t.Players) == 0 {
				// A table that has not started yet (e.g. pregame)
				deleteTable(t)
				logger.Info("Successfully cleared pregame table #" + strconv.FormatUint(t.ID, 10) + ".")
			} else if t.Replay && len(t.ActiveSpectators()) == 0 {
				// A replay or shared replay
				deleteTable(t)
				logger.Info("Successfully cleared replay table #" + strconv.FormatUint(t.ID, 10) + ".")
			}
			// (don't do anything for ongoing games)
		}
		t.Unlock(c)
	}

	c.String(http.StatusOK, "success\n")
}
