package tables

import (
	"fmt"

	"github.com/Zamiell/hanabi-live/server/pkg/table"
	"github.com/Zamiell/hanabi-live/server/pkg/util"
)

type unspectateData struct {
	userID   int
	username string
	tableID  int
}

func (m *Manager) Unspectate(userID int, username string, tableID int) {
	m.newRequest(requestTypeUnspectate, &unspectateData{ // nolint: errcheck
		userID:   userID,
		username: username,
		tableID:  tableID,
	})
}

func (m *Manager) unspectate(data interface{}) interface{} {
	var d *unspectateData
	if v, ok := data.(*unspectateData); !ok {
		m.logger.Errorf("Failed type assertion for data of type: %T", d)
		return false
	} else {
		d = v
	}

	var t *table.Manager
	if v, ok := m.tables[d.tableID]; !ok {
		msg := fmt.Sprintf("Table %v does not exist.", d.tableID)
		m.Dispatcher.Sessions.NotifyWarning(d.userID, msg)
		return false
	} else {
		t = v
	}

	// Validate that they are spectating the game
	spectatingAtTables := m.getUserSpectating(d.userID)
	if !util.IntInSlice(d.tableID, spectatingAtTables) {
		msg := fmt.Sprintf(
			"You are not spectating table %v, so you cannot unspectate it.",
			d.tableID,
		)
		m.Dispatcher.Sessions.NotifyWarning(d.userID, msg)
		return false
	}

	// Keep track of user to table relationships
	m.deleteUserSpectating(d.userID, d.tableID)

	// Remove the spectator on the table itself
	if shouldDelete, err := t.Unspectate(d.userID, d.username); err != nil {
		m.logger.Errorf(
			"Failed to unspectate %v from table %v: %v",
			util.PrintUser(d.userID, d.username),
			d.tableID,
			err,
		)
		return false
	} else if shouldDelete {
		// This was the last spectator to leave the replay, so delete it
		m.delete(d.tableID, t)
	}

	return true
}
