package main

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

func httpLocalhostTerminate(c *gin.Context) {
	// Local variables
	w := c.Writer

	// Validate the table ID
	tableIDString := c.PostForm("tableID")
	if tableIDString == "" {
		http.Error(w, "Error: You must specify a table ID.", http.StatusBadRequest)
		return
	}
	var tableID int
	if v, err := strconv.Atoi(tableIDString); err != nil {
		http.Error(w, "Error: That is not a valid number.", http.StatusBadRequest)
		return
	} else {
		tableID = v
	}

	// Check to see if this table ID exists
	if t, ok := tables[tableID]; !ok {
		c.String(http.StatusOK, "Table \""+strconv.Itoa(tableID)+"\" does not exist.\n")
		return
	} else {
		// Terminate it
		terminate(t, "Hanabi Live", -1)
	}
}
