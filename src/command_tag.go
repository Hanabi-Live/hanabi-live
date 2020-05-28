package main

import (
	"strconv"
)

// commandTag is sent when a user types the "/tag [tag]" command
//
// Example data:
// {
//   tableID: 123,
//   msg: 'inverted priority finesse',
// }
func commandTag(s *Session, d *CommandData) {
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

	room := "table" + strconv.Itoa(tableID)
	chatServerSend(s.Username()+" has added a tag of \""+d.Msg+"\".", room)
}
