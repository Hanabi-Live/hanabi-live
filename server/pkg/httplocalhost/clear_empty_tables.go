package httplocalhost

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// If calls to the database fail for whatever reason,
// it is possible for tables to be created with no people in them
// So we allow an administrator to clear them manually
func clearEmptyTables(c *gin.Context) {
	// TODO
	/*
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
					hLog.Infof("Successfully cleared pregame table: %v", t.ID)
				} else if t.Replay && len(t.Spectators) == 0 {
					// A replay or shared replay
					deleteTable(t)
					hLog.Infof("Successfully cleared replay table: %v", t.ID)
				}
				// (don't do anything for ongoing games)
			}
			t.Unlock(c)
		}
	*/

	c.String(http.StatusOK, "success\n")
}
