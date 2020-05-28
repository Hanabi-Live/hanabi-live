package main

import (
	"strconv"
)

// commandTags is sent when a user types the "/tags" command
//
// Example data:
// {
//   tableID: 123,
// }
func commandTags(s *Session, d *CommandData) {
	// Validate that the table exists
	tableID := d.TableID
	var t *Table
	if v, ok := tables[tableID]; !ok {
		s.Warning("Table " + strconv.Itoa(tableID) + " does not exist.")
		return
	} else {
		t = v
	}

	if !t.Running {
		s.Warning(ChatCommandNotStartedFail)
		return
	}
}
