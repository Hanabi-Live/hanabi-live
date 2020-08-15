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

	searchingByName := false
	var tableID uint64
	if v, err := strconv.ParseUint(tableNameOrID, 10, 64); err != nil {
		searchingByName = true
	} else {
		tableID = v
	}

	// Get the corresponding table
	var matchingTable *Table
	if searchingByName {
		for _, t := range tables {
			if t.Name == tableNameOrID {
				matchingTable = t
				break
			}
		}
		if matchingTable == nil {
			msg := "Table \"" + tableNameOrID + "\" does not exist.\n"
			c.String(http.StatusOK, msg)
			return
		}
	} else {
		if v, ok := tables[tableID]; !ok {
			msg := "Table \"" + strconv.FormatUint(tableID, 10) + "\" does not exist.\n"
			c.String(http.StatusOK, msg)
			return
		} else {
			matchingTable = v
		}
	}

	// Terminate it
	s := matchingTable.GetOwnerSession()
	commandAction(s, &CommandData{
		TableID: matchingTable.ID,
		Type:    ActionTypeEndGame,
		Target:  -1,
		Value:   EndConditionTerminated,
	})
}
