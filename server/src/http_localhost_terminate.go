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
		tableNameOrID = c.Query("tableID")
	}
	if tableNameOrID == "" {
		http.Error(w, "Error: You must specify a table name or a table ID.", http.StatusBadRequest)
		return
	}

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
	t, exists := getTableAndLock(c, nil, tableID, true, true)
	if !exists {
		msg := "Table \"" + strconv.FormatUint(tableID, 10) + "\" does not exist.\n"
		c.String(http.StatusOK, msg)
		return
	}
	defer t.Unlock(c)

	// Terminate it
	s := t.GetOwnerSession()
	commandAction(c, s, &CommandData{ // nolint: exhaustivestruct
		TableID:     t.ID,
		Type:        ActionTypeEndGame,
		Target:      -1,
		Value:       EndConditionTerminatedByPlayer,
		NoTableLock: true,
	})
}
