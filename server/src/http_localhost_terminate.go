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
	var tableID int
	if v, err := strconv.Atoi(tableNameOrID); err != nil {
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
			c.String(http.StatusOK, "Table \""+tableNameOrID+"\" does not exist.\n")
			return
		}
	} else {
		if v, ok := tables[tableID]; !ok {
			c.String(http.StatusOK, "Table \""+strconv.Itoa(tableID)+"\" does not exist.\n")
			return
		} else {
			matchingTable = v
		}
	}

	// Terminate it
	commandAction(s, &CommandData{
		TableID: matchingTable.ID,
		Type:    ActionTypeGameOver,
		Target:  -1,
		Value:   EndConditionTerminated,
	})
}
