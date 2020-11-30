package main

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

func httpLocalhostTerminate(c *gin.Context) {
	// Local variables
	w := c.Writer

	// Validate the table name / table ID
	tableNameOrID := c.PostForm("tableID")
	if tableNameOrID == "" {
		http.Error(w, "Error: You must specify a table name or a table ID.", http.StatusBadRequest)
		return
	}

	// Since this is a function that changes a user's relationship to tables,
	// we must acquires the tables lock to prevent race conditions
	tables.Lock(c)
	defer tables.Unlock(c)

	searchingByName := false
	var tableID uint64
	if v, err := strconv.ParseUint(tableNameOrID, 10, 64); err != nil {
		searchingByName = true
	} else {
		tableID = v
	}

	if searchingByName {
		if v, exists := getTableIDFromName(c, tableNameOrID); !exists {
			msg := "Table \"" + tableNameOrID + "\" does not exist.\n"
			c.String(http.StatusOK, msg)
			return
		} else {
			tableID = v
		}
	}

	// Get the corresponding table
	t, exists := getTableAndLock(c, nil, tableID, true, false)
	if !exists {
		msg := "Table \"" + strconv.FormatUint(tableID, 10) + "\" does not exist.\n"
		c.String(http.StatusOK, msg)
		return
	}

	// Terminate it
	s := t.GetOwnerSession()
	commandAction(c, s, &CommandData{ // nolint: exhaustivestruct
		TableID:      t.ID,
		Type:         ActionTypeEndGame,
		Target:       -1,
		Value:        EndConditionTerminated,
		NoTableLock:  true,
		NoTablesLock: true,
	})
}
