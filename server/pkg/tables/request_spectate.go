package tables

import (
	"fmt"

	"github.com/Zamiell/hanabi-live/server/pkg/table"
)

type spectateData struct {
	userID               int
	username             string
	tableID              int
	shadowingPlayerIndex int
}

func (m *Manager) Spectate(userID int, username string, tableID int, shadowingPlayerIndex int) {
	m.newRequest(requestTypeSpectate, &spectateData{ // nolint: errcheck
		userID:               userID,
		username:             username,
		tableID:              tableID,
		shadowingPlayerIndex: shadowingPlayerIndex,
	})
}

func (m *Manager) spectate(data interface{}) interface{} {
	var d *spectateData
	if v, ok := data.(*spectateData); !ok {
		m.logger.Errorf("Failed type assertion for data of type: %T", d)
		return false
	} else {
		d = v
	}

	// Validate that they are not already spectating another table
	spectatingAtTables := m.getUserSpectating(d.userID)
	if len(spectatingAtTables) > 0 {
		msg := fmt.Sprintf(
			"You are already spectating a table, so you cannot spectate table: %v",
			d.tableID,
		)
		m.Dispatcher.Sessions.NotifyWarning(d.userID, msg)
		return false
	}

	// Get the associated table manager
	var t *table.Manager
	if v, ok := m.tables[d.tableID]; !ok {
		msg := fmt.Sprintf("Table %v does not exist.", d.tableID)
		m.Dispatcher.Sessions.NotifyWarning(d.userID, msg)
		return false
	} else {
		t = v
	}

	if ok := t.Spectate(d.userID, d.username, d.shadowingPlayerIndex); !ok {
		return false
	}

	// Keep track of user to table relationships
	m.addUserSpectating(d.userID, d.tableID)

	return true
}
