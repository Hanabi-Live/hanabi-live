package tables

import (
	"fmt"

	"github.com/Zamiell/hanabi-live/server/pkg/table"
	"github.com/Zamiell/hanabi-live/server/pkg/util"
)

type leaveData struct {
	userID   int
	username string
	tableID  int
}

func (m *Manager) Leave(userID int, username string, tableID int) {
	m.newRequest(requestTypeLeave, &leaveData{ // nolint: errcheck
		userID:   userID,
		username: username,
		tableID:  tableID,
	})
}

func (m *Manager) leave(data interface{}) interface{} {
	var d *leaveData
	if v, ok := data.(*leaveData); !ok {
		m.logger.Errorf("Failed type assertion for data of type: %T", d)
		return false
	} else {
		d = v
	}

	// Validate that the player is joined to this table
	playingAtTables := m.getUserPlaying(d.userID)
	if !util.IntInSlice(d.tableID, playingAtTables) {
		msg := fmt.Sprintf("You are not joined to table %v, so you cannot leave it.", d.tableID)
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

	leaveReturnData := t.Leave(d.userID, d.username)
	if !leaveReturnData.Ok {
		return false
	}

	// Keep track of user to table relationships
	m.deleteUserPlaying(d.userID, d.tableID)

	if leaveReturnData.Delete {
		m.delete(d.tableID, t)
		m.logger.Infof("tablesManager - Ended pre-game table %v from a leave request.", d.tableID)
	}

	return true
}
