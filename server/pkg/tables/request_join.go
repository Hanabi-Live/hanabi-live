package tables

import (
	"fmt"
	"strings"

	"github.com/Zamiell/hanabi-live/server/pkg/table"
	"github.com/Zamiell/hanabi-live/server/pkg/util"
)

type joinData struct {
	userID   int
	username string
	tableID  int
	password string
}

func (m *Manager) Join(userID int, username string, tableID int, password string) {
	m.newRequest(requestTypeJoin, &joinData{ // nolint: errcheck
		userID:   userID,
		username: username,
		tableID:  tableID,
		password: password,
	})
}

func (m *Manager) join(data interface{}) interface{} {
	var d *joinData
	if v, ok := data.(*joinData); !ok {
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

	// Validate that the player is not already joined to this table
	playingAtTables := m.getUserPlaying(d.userID)
	if util.IntInSlice(d.tableID, playingAtTables) {
		msg := "You have already joined this table."
		m.Dispatcher.Sessions.NotifyWarning(d.userID, msg)
		return false
	}

	// Validate that the player is not joined to any table
	// (only bots have the ability to join more than one table)
	if !strings.HasPrefix(d.username, "Bot-") {
		if len(playingAtTables) > 0 {
			msg := "You cannot join more than one table at a time. Terminate your other game before joining a new one."
			m.Dispatcher.Sessions.NotifyWarning(d.userID, msg)
			return false
		}
	}

	if ok := t.Join(d.userID, d.username, d.password); !ok {
		return false
	}

	// Keep track of user to table relationships
	m.addUserPlaying(d.userID, d.tableID)

	return true
}
